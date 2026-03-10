-- ============================================================================
-- STUDENT BOOKING RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Reservar y cancelar por student_id
-- 2. Exponer listado y detalle de reservas para alumno y tutor
-- 3. Registrar movimientos en student_credit_ledger
-- ============================================================================

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
  end_at timestamptz
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
    s.end_at
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
  end_at timestamptz
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
    s.end_at
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

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= current_date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= current_date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles';
  END IF;

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

DROP FUNCTION IF EXISTS public.cancel_booking(uuid);
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_session public.sessions;
  v_membership public.student_memberships;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF NOT public.can_access_student(v_booking.student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta reserva';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes cancelar reservas activas';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'La clase ya comenzo o finalizo';
  END IF;

  IF v_session.start_at < (now() + interval '4 hours') THEN
    RAISE EXCEPTION 'Solo puedes cancelar hasta 4 horas antes de la clase';
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL THEN
    SELECT *
    INTO v_membership
    FROM public.student_memberships
    WHERE id = v_booking.active_membership_id
    FOR UPDATE;

    IF v_membership IS NOT NULL THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
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
        v_booking.student_id,
        v_membership.id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion dentro de la ventana permitida',
        v_actor_id,
        now()
      );
    END IF;
  END IF;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_student_bookings(uuid) IS
  'Lista las reservas del alumno accesible para alumno o tutor.';

COMMENT ON FUNCTION public.get_booking_detail(uuid) IS
  'Retorna el detalle de una reserva accesible por alumno o tutor.';

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion para el alumno accesible y descuenta un credito de la membresia activa.';

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva accesible y devuelve el credito si se cancela con al menos 4 horas de anticipacion.';
