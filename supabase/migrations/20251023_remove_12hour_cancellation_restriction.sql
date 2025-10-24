-- =====================================================
-- MIGRACIÓN: ELIMINAR RESTRICCIÓN DE 12 HORAS EN CANCELACIONES
-- Fecha: 2025-10-23
-- Propósito: Permitir devolución de crédito siempre al cancelar, sin restricción de tiempo
-- =====================================================

-- Actualizar la función cancel_booking para remover la restricción de 12 horas
CREATE OR REPLACE FUNCTION cancel_booking(p_booking uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY definer
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_booking bookings;
  v_session sessions;
BEGIN
  IF v_user IS NULL THEN
    RAISE exception 'No autenticado';
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking AND user_id = v_user FOR UPDATE;
  IF v_booking IS NULL THEN
    RAISE exception 'Reserva no encontrada';
  END IF;

  SELECT * INTO v_session FROM sessions WHERE id = v_booking.session_id;
  IF v_session.start_at <= now() THEN
    RAISE exception 'La clase ya comenzó o finalizó';
  END IF;

  UPDATE bookings SET status = 'cancelled' WHERE id = p_booking RETURNING * INTO v_booking;

  -- Siempre devolver el crédito al cancelar (sin restricción de tiempo)
  UPDATE profiles SET classes_remaining = classes_remaining + 1 WHERE id = v_user;

  RETURN v_booking;
END;
$$;

-- Asegurar permisos
GRANT EXECUTE ON FUNCTION cancel_booking(uuid) TO authenticated;

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================