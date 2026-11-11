-- Limit student and guardian self-service to the student's assigned site.
-- Administrative booking routes remain unrestricted. Existing reservations are not changed.

CREATE OR REPLACE FUNCTION public.book_session_multisite(p_session uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))) AND v_student.home_location_id IS NULL THEN
    RAISE EXCEPTION 'Tu sede no está asignada. Contacta a la academia para poder reservar';
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))) AND v_session.location_id IS DISTINCT FROM v_student.home_location_id THEN
    RAISE EXCEPTION 'Solo puedes reservar en la sede asignada a tu cuenta';
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_available_multisite_sessions_for_student(p_student_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(session_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text, already_reserved boolean, distance_m integer, bow_usage_type text, spots_for_student integer, location_code text, location_name text, location_address text, booking_mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE (session.location_id = (SELECT home_location_id FROM public.students WHERE id = v_student_id) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')))
    AND session.status = 'scheduled'
    AND session.start_at > now()
    AND now() < session.start_at - interval '2 hours'
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
  ORDER BY session.start_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_available_sessions_for_student(p_student_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(session_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text, already_reserved boolean, distance_m integer, bow_usage_type text, slot_capacity integer, distance_reserved integer, bow_capacity integer, bow_reserved integer, spots_for_student integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;

  IF COALESCE(v_student.operational_status, 'active') IN ('retired', 'withdrawn', 'blocked', 'suspended')
    OR (COALESCE(v_student.is_active, true) = false AND COALESCE(v_student.operational_status, 'active') <> 'paused')
  THEN
    RETURN;
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  SELECT
    s.id,
    s.start_at,
    s.end_at,
    s.status::text,
    (reservation.session_id IS NOT NULL),
    v_student.current_distance_m,
    v_bow_usage_type,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_capacity')::integer ELSE 1 END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_bows_used')::integer ELSE 0 END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_capacity')::integer ELSE NULL END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_bows_used')::integer ELSE NULL END,
    CASE
      WHEN s.status <> 'scheduled' OR s.start_at <= now() OR reservation.session_id IS NOT NULL THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned') THEN 1
      ELSE (equipment.data->>'academy_bows_remaining')::integer
    END::integer
  FROM public.sessions s
  INNER JOIN LATERAL public.select_student_membership_for_date(
    v_student_id,
    (s.start_at AT TIME ZONE 'America/Lima')::date
  ) eligible_membership ON eligible_membership.id IS NOT NULL
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(s.id) AS data
  ) equipment
  LEFT JOIN LATERAL (
    SELECT b.session_id
    FROM public.bookings b
    WHERE b.session_id = s.id
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
    LIMIT 1
  ) reservation ON true
  WHERE (s.location_id = v_student.home_location_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')))
    AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
  ORDER BY s.start_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_student_booking_agenda(p_student_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(session_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text, already_reserved boolean, distance_m integer, bow_usage_type text, spots_for_student integer, location_code text, location_name text, location_address text, booking_mode text, can_book boolean, eligibility_reason text, eligibility_message text, credit_kind text, eligible_membership_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_student_id uuid; v_student public.students; v_can_operate boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
 v_student_id:=public.resolve_accessible_student_id(p_student_id);
 IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to<p_date_from OR p_date_to-p_date_from>31 THEN RAISE EXCEPTION 'Rango de agenda inválido'; END IF;
 SELECT * INTO v_student FROM public.students WHERE id=v_student_id;
 IF v_student.home_location_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')) THEN
  RAISE EXCEPTION 'Tu sede no está asignada. Contacta a la academia para poder reservar';
 END IF;
 -- sync_student_membership_operational_status would reactivate a non-protected student
 -- only with an already-started, valid cycle with normal/recovery balance. Evaluate it
 -- without running the mutating sync. A future-only cycle leaves the account paused.
 SELECT NOT public.is_student_protected_operational_status(v_student.operational_status) AND EXISTS (
  SELECT FROM public.student_memberships m WHERE m.student_id=v_student_id AND m.status='active'
   AND m.start_date<=(now() AT TIME ZONE 'America/Lima')::date
   AND (m.end_date IS NULL OR m.end_date>=(now() AT TIME ZONE 'America/Lima')::date)
   AND (m.classes_remaining>0 OR EXISTS(SELECT FROM public.membership_recovery_credits r WHERE r.student_membership_id=m.id AND r.classes_remaining>0))
 ) INTO v_can_operate;
 RETURN QUERY
 SELECT s.id,s.start_at,s.end_at,s.status::text,own_booking.reserved,
  v_student.current_distance_m,a.data->>'bow_usage_type',
  GREATEST(LEAST(COALESCE((a.data->>'physical_spots_remaining')::integer,0),
    CASE WHEN a.data->>'bow_usage_type' IN ('shared_inventory','assigned') THEN COALESCE((a.data->>'shared_bows_remaining')::integer,0)
    ELSE COALESCE((a.data->>'physical_spots_remaining')::integer,0) END),0),
  l.code,l.name,l.address,s.booking_mode,
  reason.code='available',reason.code,
  CASE WHEN reason.code='capacity' THEN a.data->>'message' ELSE NULL END,
  selected.credit,selected.id
 FROM public.sessions s
 JOIN public.academy_locations l ON l.id=s.location_id
 CROSS JOIN LATERAL (SELECT (s.start_at AT TIME ZONE 'America/Lima')::date AS day) local_day
 CROSS JOIN LATERAL (SELECT local_day.day-(EXTRACT(ISODOW FROM local_day.day)::integer-1) AS monday) week
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT FROM public.bookings b WHERE b.session_id=s.id AND b.student_id=v_student_id AND b.status='reserved') AS reserved) own_booking
 CROSS JOIN LATERAL (SELECT public.get_multisite_session_availability(s.id,v_student_id,false,NULL) AS data) a
 CROSS JOIN LATERAL (
  WITH cycles AS (
   SELECT sm.id,sm.start_date,sm.created_at,
    EXISTS(SELECT FROM public.membership_freezes f WHERE f.membership_purchase_id=sm.purchase_id AND f.status<>'cancelled' AND local_day.day BETWEEN f.start_date AND f.end_date) AS frozen,
    sm.classes_remaining>(SELECT count(*) FROM public.bookings b WHERE b.active_membership_id=sm.id AND b.credit_kind='normal' AND (b.status='reserved' OR EXISTS(SELECT FROM public.booking_cancellations bc WHERE bc.booking_id=b.id AND bc.review_status='pending'))) AS normal_available,
    (sm.weekly_class_target=0 OR (SELECT count(*) FROM public.bookings b JOIN public.sessions ws ON ws.id=b.session_id WHERE b.active_membership_id=sm.id AND b.credit_kind='normal' AND (ws.start_at AT TIME ZONE 'America/Lima')::date BETWEEN week.monday AND week.monday+6 AND (b.status IN ('reserved','attended','no_show') OR EXISTS(SELECT FROM public.booking_cancellations bc WHERE bc.booking_id=b.id AND (bc.review_status='pending' OR bc.resolution='no_show'))))<sm.weekly_class_target) AS quota_available,
    EXISTS(SELECT FROM public.membership_recovery_credits r WHERE r.student_membership_id=sm.id AND r.classes_remaining>(SELECT count(*) FROM public.bookings b WHERE b.recovery_credit_id=r.id AND (b.status='reserved' OR EXISTS(SELECT FROM public.booking_cancellations bc WHERE bc.booking_id=b.id AND bc.review_status='pending')))) AS recovery_available
   FROM public.student_memberships sm
   WHERE sm.student_id=v_student_id AND sm.status='active' AND sm.start_date<=local_day.day AND (sm.end_date IS NULL OR sm.end_date>=local_day.day)
  ), eligible AS (
   SELECT c.id,CASE WHEN c.normal_available AND c.quota_available THEN 'normal' ELSE 'recovery' END AS credit
   FROM cycles c WHERE NOT c.frozen AND ((c.normal_available AND c.quota_available) OR c.recovery_available)
   ORDER BY c.start_date,c.created_at,c.id LIMIT 1
  )
  SELECT (SELECT e.id FROM eligible e) AS id,(SELECT e.credit FROM eligible e) AS credit,
   CASE WHEN NOT EXISTS(SELECT FROM cycles) THEN 'membership_dates'
    WHEN NOT EXISTS(SELECT FROM cycles c WHERE NOT c.frozen) THEN 'frozen'
    WHEN EXISTS(SELECT FROM cycles c WHERE NOT c.frozen AND c.normal_available AND NOT c.quota_available) THEN 'weekly_limit'
    ELSE 'no_balance' END AS missing_reason
 ) selected
 CROSS JOIN LATERAL (
  SELECT CASE WHEN own_booking.reserved THEN 'already_reserved'
   WHEN s.start_at<=now() THEN 'past'
   WHEN now()>=s.start_at-interval '2 hours' THEN 'cutoff'
   WHEN public.is_student_protected_operational_status(v_student.operational_status) THEN 'student_inactive'
   WHEN v_student.current_distance_m IS NULL THEN 'distance_missing'
   WHEN selected.id IS NULL THEN selected.missing_reason
   WHEN NOT v_can_operate THEN 'student_inactive'
   WHEN NOT COALESCE((a.data->>'available')::boolean,false) THEN 'capacity'
   ELSE 'available' END AS code
 ) reason
 WHERE (s.location_id = v_student.home_location_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))) AND s.status='scheduled'
  AND s.start_at>now() AND local_day.day BETWEEN p_date_from AND p_date_to
 ORDER BY s.start_at,s.id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_booking_session(p_booking_id uuid, p_new_session_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_booking public.bookings;
  v_old_session public.sessions;
  v_new_session public.sessions;
  v_availability jsonb;
  v_is_admin boolean := false;
  v_old_day_cutoff timestamptz;
  v_new_day_cutoff timestamptz;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Comprobar si el actor es superadmin o admin
  SELECT role INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id;

  IF v_actor_role IN ('superadmin', 'admin') THEN
    v_is_admin := true;
  END IF;

  -- 1. Obtener la reserva original
  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF NOT v_is_admin AND NOT public.can_access_student(v_booking.student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a modificar esta reserva';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes modificar reservas activas';
  END IF;

  -- 2. Obtener sesión origen
  SELECT *
  INTO v_old_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_old_session IS NULL THEN
    RAISE EXCEPTION 'Sesion original no encontrada';
  END IF;

  IF NOT v_is_admin THEN
    IF v_old_session.start_at <= now() THEN
      RAISE EXCEPTION 'La clase ya comenzo o finalizo';
    END IF;

    v_old_day_cutoff := public.get_booking_day_cutoff(
      (v_old_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_old_day_cutoff IS NOT NULL AND now() >= v_old_day_cutoff THEN
      RAISE EXCEPTION 'Los cambios de reserva para este dia se cerraron 2 horas antes del primer turno';
    END IF;
  END IF;

  -- 3. Obtener sesión destino y validar viabilidad
  SELECT *
  INTO v_new_session
  FROM public.sessions
  WHERE id = p_new_session_id
  FOR UPDATE;

  IF v_new_session IS NULL THEN
    RAISE EXCEPTION 'La nueva sesion no existe';
  END IF;

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.students st WHERE st.id = v_booking.student_id
      AND st.home_location_id = v_new_session.location_id
  ) THEN
    RAISE EXCEPTION 'Solo puedes reservar en la sede asignada a tu cuenta';
  END IF;

  IF v_new_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La nueva sesion no esta disponible';
  END IF;

  IF NOT v_is_admin AND v_new_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reasignar la reserva a una clase pasada';
  END IF;

  IF p_new_session_id = v_booking.session_id THEN
    RAISE EXCEPTION 'La reserva ya esta asignada a esta sesion';
  END IF;

  IF NOT v_is_admin THEN
    v_new_day_cutoff := public.get_booking_day_cutoff(
      (v_new_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_new_day_cutoff IS NOT NULL AND now() >= v_new_day_cutoff THEN
      RAISE EXCEPTION 'Los cambios de reserva para este dia se cerraron 2 horas antes del primer turno';
    END IF;
  END IF;

  -- 4. Validar colisión de reservas por este alumno
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_new_session_id
      AND b.student_id = v_booking.student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya tiene reservada esta nueva sesion';
  END IF;

  -- 5. Verificar cupo temporalmente liberando el espacio en la sesión origen
  v_availability := public.check_session_availability_v3(
    p_new_session_id,
    v_booking.student_id
  );

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  -- 6. Actualizar la reserva
  UPDATE public.bookings
  SET
    session_id = p_new_session_id,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$function$
;

COMMENT ON COLUMN public.students.home_location_id IS 'Sede asignada del alumno; determina dónde puede reservar por su cuenta.';

-- A legacy update policy allows students to update their own bookings directly.
-- Enforce the same rule there, without affecting ordinary cancellation updates.
CREATE OR REPLACE FUNCTION public.guard_student_booking_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.student_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students st JOIN public.sessions se ON se.location_id = st.home_location_id
    WHERE st.id = NEW.student_id AND se.id = NEW.session_id
  ) THEN
    RAISE EXCEPTION 'Solo puedes reservar en la sede asignada a tu cuenta';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_student_booking_location() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_student_booking_location ON public.bookings;
CREATE TRIGGER guard_student_booking_location BEFORE INSERT OR UPDATE OF session_id, student_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_student_booking_location();

CREATE OR REPLACE FUNCTION public.book_session(p_session uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_session_day_cutoff timestamptz;
  v_pending_reserved_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT * INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.operational_status, 'active') IN ('retired', 'withdrawn', 'blocked', 'suspended')
    OR (
      COALESCE(v_student.is_active, true) = false
      AND COALESCE(v_student.operational_status, 'active') <> 'paused'
    )
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin'))
    AND (v_student.home_location_id IS NULL OR v_session.location_id IS DISTINCT FROM v_student.home_location_id) THEN
    RAISE EXCEPTION 'Solo puedes reservar en la sede asignada a tu cuenta';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  v_session_day_cutoff := public.get_booking_day_cutoff(
    (v_session.start_at AT TIME ZONE 'America/Lima')::date
  );

  IF v_session_day_cutoff IS NOT NULL AND now() >= v_session_day_cutoff THEN
    RAISE EXCEPTION 'Las reservas para este dia se cerraron 2 horas antes del primer turno';
  END IF;

  LOOP
    SELECT * INTO v_membership
    FROM public.select_student_membership_for_date(
      v_student_id,
      (v_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_membership IS NULL THEN
      RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
    END IF;

    SELECT sm.* INTO v_membership
    FROM public.student_memberships sm
    WHERE sm.id = v_membership.id
    FOR UPDATE;

    SELECT COUNT(*)::integer INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count < COALESCE(v_membership.classes_remaining, 0) THEN
      EXIT;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(p_session, v_student_id);

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (CASE
      WHEN v_bow_usage_type = 'own' THEN 'ownbow'
      WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
      ELSE NULL
    END)::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$function$
;


