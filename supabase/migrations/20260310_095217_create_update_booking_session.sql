-- ============================================================================
-- RPC: update_booking_session
-- Fecha: 2026-03-10
-- Proposito: Permite cambiar la sesión (fecha/hora) de una reserva existente.
-- Reglas:
-- 1. La reserva debe existir, pertenecer a un alumno accesible o ser administrador.
-- 2. La reserva origen debe estar en estado 'reserved'.
-- 3. La sesión origen debe estar a > 12 horas (si el usuario no es admin).
-- 4. La sesión destino debe estar a futuro y con cupo disponible.
-- ============================================================================

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

  -- 2. Obtener sesión origen y validar restricción de 12 horas
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

    IF v_old_session.start_at < (now() + interval '12 hours') THEN
      RAISE EXCEPTION 'Solo puedes modificar una reserva con al menos 12 horas de anticipacion';
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

  IF v_new_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reasignar la reserva a una clase pasada';
  END IF;

  IF p_new_session_id = v_booking.session_id THEN
    RAISE EXCEPTION 'La reserva ya esta asignada a esta sesion';
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
  -- La lógica real de cupos considera la tabla bindings, pero como estamos en
  -- la misma transacción, el update no se ha commiteado.
  -- Simplemente validamos la disponibilidad general de la sesión destino.
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

  -- No es necesario actualizar student_memberships ni student_credit_ledger 
  -- puesto que es un simple traslado (swapa un crédito de una sesión a otra).
  
  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_booking_session(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_booking_session(uuid, uuid) IS 
  'Cambia la sesión de una reserva a una nueva. Permite a los usuarios hacerlo >12h antes. Admins bypass.';
