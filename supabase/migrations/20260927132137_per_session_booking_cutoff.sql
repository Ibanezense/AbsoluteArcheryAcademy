-- Student self-service booking closes independently for every session.
-- The former daily cutoff hid every remaining turn once the first turn's
-- cutoff had passed.

CREATE OR REPLACE FUNCTION public.book_session_multisite(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_location public.academy_locations;
  v_membership public.student_memberships;
  v_membership_id uuid;
  v_booking public.bookings;
  v_availability jsonb;
  v_session_date date;
  v_week_start date;
  v_credit_kind text;
  v_recovery_id uuid;
  v_session_cutoff timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF COALESCE(v_student.operational_status, 'active') IN
    ('inactive', 'paused', 'retired', 'withdrawn', 'blocked', 'suspended')
  THEN RAISE EXCEPTION 'El alumno no esta activo para reservar'; END IF;
  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session FOR UPDATE;
  IF v_session.id IS NULL OR v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;
  SELECT * INTO v_location FROM public.academy_locations WHERE id = v_session.location_id;
  IF v_location.code <> 'tiabaya' OR v_session.booking_mode <> 'flexible' THEN
    RAISE EXCEPTION 'Este turno se administra mediante horario fijo';
  END IF;
  IF v_session.start_at <= now() THEN RAISE EXCEPTION 'No puedes reservar una clase pasada'; END IF;

  v_session_date := (v_session.start_at AT TIME ZONE 'America/Lima')::date;
  v_week_start := v_session_date - (EXTRACT(ISODOW FROM v_session_date)::integer - 1);
  v_session_cutoff := v_session.start_at - interval '2 hours';
  IF now() >= v_session_cutoff THEN
    RAISE EXCEPTION 'Las reservas para este turno se cerraron 2 horas antes de su inicio';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.session_id = p_session AND b.student_id = v_student_id AND b.status = 'reserved'
  ) THEN RAISE EXCEPTION 'El alumno ya reservo esta sesion'; END IF;

  SELECT candidate.membership_id, candidate.credit_kind, candidate.recovery_id
  INTO v_membership_id, v_credit_kind, v_recovery_id
  FROM (
    SELECT
      sm.id AS membership_id,
      CASE
        WHEN (
          sm.classes_remaining > commitments.normal_commitments
          AND (sm.weekly_class_target = 0 OR weekly.normal_count < sm.weekly_class_target)
        ) THEN 'normal'
        ELSE 'recovery'
      END AS credit_kind,
      recovery.first_recovery_id AS recovery_id,
      sm.start_date,
      sm.created_at,
      sm.id
    FROM public.student_memberships sm
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(SUM(mrc.classes_remaining), 0)::integer AS total_recovery_remaining,
        (
          SELECT candidate_credit.id
          FROM public.membership_recovery_credits candidate_credit
          WHERE candidate_credit.student_membership_id = sm.id
            AND candidate_credit.classes_remaining > (
              SELECT COUNT(*)::integer
              FROM public.bookings committed_booking
              WHERE committed_booking.recovery_credit_id = candidate_credit.id
                AND (
                  committed_booking.status = 'reserved'
                  OR EXISTS (
                    SELECT 1 FROM public.booking_cancellations committed_cancellation
                    WHERE committed_cancellation.booking_id = committed_booking.id
                      AND committed_cancellation.review_status = 'pending'
                  )
                )
            )
          ORDER BY candidate_credit.created_at, candidate_credit.id
          LIMIT 1
        ) AS first_recovery_id
      FROM public.membership_recovery_credits mrc
      WHERE mrc.student_membership_id = sm.id
    ) recovery
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE b.credit_kind = 'normal')::integer AS normal_commitments,
        COUNT(*) FILTER (WHERE b.credit_kind = 'recovery')::integer AS recovery_commitments
      FROM public.bookings b
      WHERE b.active_membership_id = sm.id
        AND (
          b.status = 'reserved'
          OR EXISTS (
            SELECT 1 FROM public.booking_cancellations bc
            WHERE bc.booking_id = b.id AND bc.review_status = 'pending'
          )
        )
    ) commitments
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS normal_count
      FROM public.bookings b
      JOIN public.sessions weekly_session ON weekly_session.id = b.session_id
      WHERE b.active_membership_id = sm.id
        AND b.credit_kind = 'normal'
        AND (weekly_session.start_at AT TIME ZONE 'America/Lima')::date
          BETWEEN v_week_start AND v_week_start + 6
        AND (
          b.status IN ('reserved', 'attended', 'no_show')
          OR EXISTS (
            SELECT 1 FROM public.booking_cancellations bc
            WHERE bc.booking_id = b.id
              AND (bc.review_status = 'pending' OR bc.resolution = 'no_show')
          )
        )
    ) weekly
    WHERE sm.student_id = v_student_id
      AND sm.status = 'active'
      AND sm.start_date <= v_session_date
      AND (sm.end_date IS NULL OR sm.end_date >= v_session_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.membership_freezes mf
        WHERE mf.membership_purchase_id = sm.purchase_id
          AND mf.status <> 'cancelled'
          AND v_session_date BETWEEN mf.start_date AND mf.end_date
      )
      AND (
        (
          sm.classes_remaining > commitments.normal_commitments
          AND (sm.weekly_class_target = 0 OR weekly.normal_count < sm.weekly_class_target)
        )
        OR recovery.first_recovery_id IS NOT NULL
      )
    ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC
    FOR UPDATE OF sm
    LIMIT 1
  ) candidate;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'No existe una membresia elegible para la fecha, cuota y modalidad de esta sesion';
  END IF;
  SELECT * INTO v_membership
  FROM public.student_memberships
  WHERE id = v_membership_id;

  v_availability := public.get_multisite_session_availability(p_session, v_student_id, false, NULL);
  IF NOT COALESCE((v_availability->>'available')::boolean, false) THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id, student_id, booked_by_profile_id, active_membership_id,
    session_id, status, distance_m, group_type, bow_usage_type,
    bow_poundage, booking_source, credit_kind, recovery_credit_id,
    created_at, updated_at
  ) VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id), v_student_id, v_actor_id,
    v_membership.id, p_session, 'reserved', v_student.current_distance_m,
    (CASE WHEN v_student.has_own_bow THEN 'ownbow'
      WHEN v_student.assigned_bow THEN 'assigned' ELSE NULL END)::public.group_type,
    CASE WHEN v_student.has_own_bow THEN 'own'
      WHEN v_student.assigned_bow THEN 'assigned' ELSE 'shared_inventory' END,
    v_student.bow_poundage, 'flexible', v_credit_kind,
    CASE WHEN v_credit_kind = 'recovery' THEN v_recovery_id ELSE NULL END,
    now(), now()
  ) RETURNING * INTO v_booking;

  PERFORM public.claim_booking_resources(v_booking.id, false);
  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_multisite_sessions_for_student(
  p_student_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  already_reserved boolean,
  distance_m integer,
  bow_usage_type text,
  spots_for_student integer,
  location_code text,
  location_name text,
  location_address text,
  booking_mode text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  RETURN QUERY
  SELECT
    session.id,
    session.start_at,
    session.end_at,
    session.status,
    EXISTS (
      SELECT 1 FROM public.bookings own_booking
      WHERE own_booking.session_id = session.id
        AND own_booking.student_id = v_student_id
        AND own_booking.status = 'reserved'
    ),
    student.current_distance_m,
    availability.data->>'bow_usage_type',
    LEAST(
      COALESCE((availability.data->>'physical_spots_remaining')::integer, 0),
      CASE WHEN availability.data->>'bow_usage_type' IN ('shared_inventory', 'assigned')
        THEN COALESCE((availability.data->>'shared_bows_remaining')::integer, 0)
        ELSE COALESCE((availability.data->>'physical_spots_remaining')::integer, 0)
      END
    ),
    location.code,
    location.name,
    location.address,
    session.booking_mode
  FROM public.sessions session
  JOIN public.academy_locations location ON location.id = session.location_id
  JOIN public.students student ON student.id = v_student_id
  CROSS JOIN LATERAL (
    SELECT public.get_multisite_session_availability(session.id, v_student_id, false, NULL) AS data
  ) availability
  WHERE location.code = 'tiabaya'
    AND session.booking_mode = 'flexible'
    AND session.status = 'scheduled'
    AND session.start_at > now()
    AND now() < session.start_at - interval '2 hours'
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
  ORDER BY session.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.book_session_multisite(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.book_session_multisite(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.book_session_multisite(uuid, uuid) IS
  'Reserva una sesión flexible de Tiabaya hasta dos horas antes del inicio de ese turno.';
COMMENT ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) IS
  'Lista sesiones flexibles reservables y aplica un corte de dos horas independiente por turno.';
