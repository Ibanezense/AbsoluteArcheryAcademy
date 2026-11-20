-- Propuesta para pruebas aisladas. No aplicada a la base real.
CREATE OR REPLACE FUNCTION public.admin_generate_selected_weekly_sessions(p_week_start date, p_weeks integer, p_template_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p_date_from date;
  p_date_to date;
  v_template record;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_created integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_week_start IS NULL OR p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 24 THEN RAISE EXCEPTION 'Selecciona de 1 a 24 semanas'; END IF;
  IF coalesce(cardinality(p_template_ids), 0) = 0 OR array_position(p_template_ids, NULL) IS NOT NULL THEN RAISE EXCEPTION 'Selecciona al menos un horario'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_template_ids) AS selected(id) LEFT JOIN public.weekly_session_templates t ON t.id = selected.id LEFT JOIN public.academy_locations l ON l.id = t.location_id WHERE t.id IS NULL OR NOT t.is_active OR NOT l.is_active) THEN RAISE EXCEPTION 'Uno de los horarios seleccionados no está activo'; END IF;
  p_date_from := p_week_start - (extract(isodow FROM p_week_start)::integer - 1);
  p_date_to := p_date_from + p_weeks * 7 - 1;
  LOCK TABLE public.sessions IN SHARE ROW EXCLUSIVE MODE;
  FOR v_template IN
    SELECT t.*, l.timezone, l.opens_on FROM public.weekly_session_templates t
    JOIN public.academy_locations l ON l.id = t.location_id
    WHERE t.is_active AND l.is_active AND t.id = ANY(p_template_ids) ORDER BY t.weekday, t.start_time, t.id
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

REVOKE ALL ON FUNCTION public.admin_generate_selected_weekly_sessions(date,integer,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_selected_weekly_sessions(date,integer,uuid[]) TO authenticated, service_role;
