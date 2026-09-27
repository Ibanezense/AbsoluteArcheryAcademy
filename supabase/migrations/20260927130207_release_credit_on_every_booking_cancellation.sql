-- Student cancellations are final immediately. They release capacity and the
-- reserved credit commitment without entering an administrative review queue.

UPDATE public.booking_cancellations
SET
  review_status = 'resolved',
  resolution = 'justified',
  admin_reason = COALESCE(
    admin_reason,
    'Cancelación finalizada automáticamente; el crédito quedó disponible'
  ),
  resolved_by = COALESCE(resolved_by, cancelled_by),
  resolved_at = COALESCE(resolved_at, cancelled_at, now())
WHERE cancellation_source = 'student'
  AND review_status = 'pending';

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking
  FOR UPDATE;

  IF v_booking.id IS NULL
    OR v_booking.student_id IS NULL
    OR NOT public.can_access_student(v_booking.student_id)
  THEN
    RAISE EXCEPTION 'Reserva no encontrada o no autorizada';
  END IF;

  IF v_booking.status = 'cancelled' AND EXISTS (
    SELECT 1
    FROM public.booking_cancellations cancellation
    WHERE cancellation.booking_id = p_booking
  ) THEN
    RETURN v_booking;
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes cancelar reservas activas';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id
  FOR UPDATE;

  IF v_session.start_at < now() THEN
    RAISE EXCEPTION 'La reserva solo puede cancelarse hasta el inicio de la clase';
  END IF;

  INSERT INTO public.booking_cancellations (
    booking_id,
    student_id,
    cancellation_source,
    review_status,
    resolution,
    cancelled_by,
    cancelled_at,
    resolved_by,
    resolved_at,
    admin_reason
  ) VALUES (
    v_booking.id,
    v_booking.student_id,
    'student', 'resolved', 'justified',
    v_actor_id,
    now(),
    v_actor_id,
    now(),
    'Cancelación finalizada automáticamente; el crédito quedó disponible'
  )
  ON CONFLICT (booking_id) DO UPDATE
  SET
    cancellation_source = 'student',
    review_status = 'resolved',
    resolution = 'justified',
    cancelled_by = EXCLUDED.cancelled_by,
    cancelled_at = EXCLUDED.cancelled_at,
    resolved_by = EXCLUDED.resolved_by,
    resolved_at = EXCLUDED.resolved_at,
    admin_reason = EXCLUDED.admin_reason;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_by_role = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = v_actor_id AND role = 'guardian'
      ) THEN 'guardian'
      ELSE 'student'
    END,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  PERFORM public.release_booking_resources(v_booking.id, 'student');
  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva del alumno, libera cupo, recursos y crédito inmediatamente sin revisión administrativa.';
