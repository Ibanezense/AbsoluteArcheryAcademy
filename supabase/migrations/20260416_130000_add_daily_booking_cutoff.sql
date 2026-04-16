-- ============================================================================
-- Fix: enforce a daily booking cutoff based on the first scheduled session
-- Fecha: 2026-04-16
-- Proposito:
-- 1. Cerrar reservas y cambios self-service 2 horas antes del primer turno del dia
-- 2. Exponer el cutoff del dia a los RPCs de listado/detalle para el frontend
-- 3. Permite a los administradores reservar clases para alumnos incluso si el turno ya comenzo o quedo en el pasado
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_booking_day_cutoff(date);
CREATE OR REPLACE FUNCTION public.get_booking_day_cutoff(
  p_session_date date
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_session_start timestamptz;
BEGIN
  SELECT MIN(s.start_at)
  INTO v_first_session_start
  FROM public.sessions s
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = p_session_date
    AND s.status = 'scheduled';

  IF v_first_session_start IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_first_session_start - interval '2 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_day_cutoff(date) TO authenticated;

DROP FUNCTION IF EXISTS public.get_student_bookings(uuid);
CREATE OR REPLACE FUNCTION public.get_student_bookings(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  booking_id uuid,
  status text,
  group_type text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer,
  start_at timestamptz,
  end_at timestamptz,
  booking_day_cutoff_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.status::text,
    b.group_type::text,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage,
    s.start_at,
    s.end_at,
    public.get_booking_day_cutoff((s.start_at AT TIME ZONE 'America/Lima')::date) AS booking_day_cutoff_at
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
  ORDER BY s.start_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_bookings(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_booking_detail(uuid);
CREATE OR REPLACE FUNCTION public.get_booking_detail(p_booking_id uuid)
RETURNS TABLE (
  booking_id uuid,
  student_id uuid,
  status text,
  group_type text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer,
  start_at timestamptz,
  end_at timestamptz,
  booking_day_cutoff_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.student_id,
    b.status::text,
    b.group_type::text,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage,
    s.start_at,
    s.end_at,
    public.get_booking_day_cutoff((s.start_at AT TIME ZONE 'America/Lima')::date) AS booking_day_cutoff_at
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.id = p_booking_id
    AND public.can_access_student(b.student_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_detail(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.book_session(uuid);
DROP FUNCTION IF EXISTS public.book_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
  v_session_day_cutoff timestamptz;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  -- 1. Primero, obtener la sesion para saber la fecha
  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
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

  -- 2. Buscar membresia activa *que aplique para la fecha de la sesion*
  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  -- 3. Otras verificaciones
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

  v_availability := public.check_session_availability_v3(
    p_session,
    v_student_id
  );

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
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    v_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    'Reserva realizada desde la app',
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  -- Admins pueden reservar incluso turnos ya iniciados o pasados.

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(
      p_session_id,
      p_student_id
    );

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
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
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    CASE
      WHEN p_force THEN 'Reserva forzada desde admin'
      ELSE 'Reserva realizada desde admin'
    END,
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.update_booking_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.update_booking_session(
  p_booking_id uuid,
  p_new_session_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.update_booking_session(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_booking_day_cutoff(date) IS
  'Retorna el momento exacto en que se cierra la autogestion del dia: 2 horas antes del primer turno scheduled en America/Lima.';

COMMENT ON FUNCTION public.get_student_bookings(uuid) IS
  'Lista las reservas del alumno accesible para alumno o tutor e incluye el cutoff diario de autogestion.';

COMMENT ON FUNCTION public.get_booking_detail(uuid) IS
  'Retorna el detalle de una reserva accesible por alumno o tutor e incluye el cutoff diario de autogestion.';

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion para el alumno, descontando el credito de la membresia activa que cobra vigencia el dia de la clase y respetando el cutoff diario.';

COMMENT ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) IS
  'Reserva una sesion para cualquier alumno desde admin descontando el credito de la membresia aplicable en la fecha de la sesion. Puede forzar la reserva si p_force = true y permite turnos ya iniciados o pasados.';

COMMENT ON FUNCTION public.update_booking_session(uuid, uuid) IS
  'Cambia la sesion de una reserva a una nueva. Alumno y tutor solo pueden hacerlo antes del cutoff diario; admins bypass.';
