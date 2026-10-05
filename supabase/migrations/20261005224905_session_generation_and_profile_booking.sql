-- Serialize cleanup with both manual creation and template generation.
LOCK TABLE public.sessions, public.bookings, public.booking_resource_claims IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE v_duplicate record;
BEGIN
  FOR v_duplicate IN
    WITH ranked AS (
      SELECT s.id, first_value(s.id) OVER (
        PARTITION BY s.location_id, s.start_at, s.end_at
        ORDER BY EXISTS (SELECT 1 FROM public.bookings b WHERE b.session_id = s.id) DESC,
          (s.weekly_template_id IS NOT NULL) DESC, s.created_at, s.id
      ) AS keep_id
      FROM public.sessions s
      WHERE s.status = 'scheduled' AND s.start_at >= now()
    )
    SELECT s.id, ranked.keep_id, jsonb_build_object(
      'session', to_jsonb(s), 'retained_session_id', ranked.keep_id,
      'distances', (SELECT jsonb_agg(to_jsonb(a)) FROM public.session_distance_allocations a WHERE a.session_id = s.id),
      'equipment', (SELECT jsonb_agg(to_jsonb(a)) FROM public.session_equipment_allocations a WHERE a.session_id = s.id)
    ) AS snapshot
    FROM ranked JOIN public.sessions s ON s.id = ranked.id
    WHERE ranked.id <> ranked.keep_id
      AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.session_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.booking_resource_claims c WHERE c.session_id = s.id)
  LOOP
    INSERT INTO public.admin_action_audit(action_type, target_table, target_id, metadata)
    VALUES ('session_duplicate_removed', 'sessions', v_duplicate.id, v_duplicate.snapshot);
    DELETE FROM public.sessions WHERE id = v_duplicate.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_scheduled_location_time_unique
  ON public.sessions(location_id, start_at, end_at) WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION public.admin_generate_sessions_in_range(p_date_from date, p_date_to date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_template record;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_created integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to < p_date_from OR p_date_to - p_date_from > 167 THEN
    RAISE EXCEPTION 'Selecciona un rango de hasta 24 semanas';
  END IF;
  LOCK TABLE public.sessions IN SHARE ROW EXCLUSIVE MODE;
  FOR v_template IN
    SELECT t.*, l.timezone, l.opens_on FROM public.weekly_session_templates t
    JOIN public.academy_locations l ON l.id = t.location_id
    WHERE t.is_active AND l.is_active ORDER BY t.weekday, t.start_time, t.id
  LOOP
    v_date := p_date_from;
    WHILE v_date <= p_date_to LOOP
      IF extract(isodow FROM v_date)::integer = v_template.weekday
        AND (v_template.opens_on IS NULL OR v_date >= v_template.opens_on)
      THEN
        v_start := timezone(v_template.timezone, (v_date + v_template.start_time)::timestamp);
        v_end := timezone(v_template.timezone, (v_date + v_template.end_time)::timestamp);
        -- Keep manual turns and cancelled occurrences; do not recreate either.
        IF NOT EXISTS (SELECT 1 FROM public.sessions s
          WHERE s.location_id = v_template.location_id AND s.start_at = v_start AND s.end_at = v_end)
          AND NOT EXISTS (SELECT 1 FROM public.sessions s
            WHERE s.weekly_template_id = v_template.id
              AND (s.start_at AT TIME ZONE v_template.timezone)::date = v_date)
        THEN
          v_id := NULL;
          INSERT INTO public.sessions(start_at, end_at, status, notes, weekly_template_id,
            is_manual_override, location_id, capacity)
          VALUES (v_start, v_end, 'scheduled', COALESCE(v_template.label, 'Turno semanal generado'),
            v_template.id, false, v_template.location_id, COALESCE(v_template.physical_capacity, 8))
          ON CONFLICT DO NOTHING RETURNING id INTO v_id;
          IF v_id IS NOT NULL THEN
            INSERT INTO public.session_distance_allocations(session_id, distance_m, targets, slot_capacity)
            SELECT v_id, d.distance_m,
              ceil(d.slot_capacity::numeric / COALESCE(v_template.slots_per_target, 4))::integer, d.slot_capacity
            FROM public.weekly_session_template_distances d
            WHERE d.weekly_template_id = v_template.id AND d.slot_capacity > 0;
            v_created := v_created + 1;
          END IF;
        END IF;
      END IF;
      v_date := v_date + 1;
    END LOOP;
  END LOOP;
  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_sessions_from_templates(
  p_week_start date DEFAULT CURRENT_DATE, p_weeks integer DEFAULT 4
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_monday date;
BEGIN
  IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 24 THEN RAISE EXCEPTION 'p_weeks debe estar entre 1 y 24'; END IF;
  v_monday := p_week_start - (extract(isodow FROM p_week_start)::integer - 1);
  RETURN public.admin_generate_sessions_in_range(v_monday, v_monday + p_weeks * 7 - 1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_generate_sessions_in_range(date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_generate_sessions_from_templates(date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_sessions_in_range(date,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_generate_sessions_from_templates(date,integer) TO authenticated, service_role;

-- Retain the existing RPC result contract while applying actual multisite limits.
CREATE OR REPLACE FUNCTION public.get_admin_available_sessions_for_student(
  p_student_id uuid, p_date_from date, p_date_to date
)
RETURNS TABLE(session_id uuid, start_at timestamptz, end_at timestamptz, status text,
  already_reserved boolean, distance_m integer, bow_usage_type text, slot_capacity integer,
  distance_reserved integer, bow_capacity integer, bow_reserved integer, spots_for_student integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_student public.students;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_student FROM public.students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF v_student.current_distance_m IS NULL THEN RAISE EXCEPTION 'El alumno no tiene distancia configurada'; END IF;
  RETURN QUERY SELECT s.id, s.start_at, s.end_at, s.status::text,
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.session_id = s.id AND b.student_id = p_student_id AND b.status = 'reserved'),
    v_student.current_distance_m, a.data->>'bow_usage_type',
    (a.data->>'physical_capacity')::integer,
    (a.data->>'physical_capacity')::integer - (a.data->>'physical_spots_remaining')::integer,
    NULL::integer, NULL::integer,
    CASE WHEN COALESCE((a.data->>'available')::boolean, false) THEN
      LEAST((a.data->>'physical_spots_remaining')::integer,
        (a.data->>'regular_spots_remaining')::integer,
        CASE WHEN a.data->>'bow_usage_type' = 'own' THEN (a.data->>'physical_spots_remaining')::integer
          ELSE (a.data->>'shared_bows_remaining')::integer END)
      ELSE 0 END
  FROM public.sessions s JOIN public.academy_locations l ON l.id = s.location_id
  CROSS JOIN LATERAL (SELECT public.get_multisite_session_availability(s.id,p_student_id,false,NULL) data) a
  WHERE s.status = 'scheduled' AND l.is_active
    AND (s.start_at AT TIME ZONE l.timezone)::date BETWEEN p_date_from AND p_date_to
    AND (l.code <> 'umacollo' OR v_student.current_distance_m <= 20)
  ORDER BY s.start_at, l.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_available_sessions_for_student(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_available_sessions_for_student(uuid,date,date) TO authenticated, service_role;
