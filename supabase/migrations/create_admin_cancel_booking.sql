-- ====================================================================
-- FUNCIÓN: admin_cancel_booking
-- ====================================================================
-- Permite que un admin cancele la reserva de cualquier estudiante
-- y devuelve automáticamente el crédito de clase al estudiante
-- ====================================================================

DROP FUNCTION IF EXISTS admin_cancel_booking(uuid);

CREATE OR REPLACE FUNCTION admin_cancel_booking(
  p_booking_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking bookings;
  v_session sessions;
  v_student_id uuid;
BEGIN
  -- Verificar que el usuario es admin
  SELECT exists (
    SELECT 1 FROM profiles 
    WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No autorizado - Solo admins pueden cancelar reservas';
  END IF;

  -- Obtener la reserva
  SELECT * INTO v_booking 
  FROM bookings 
  WHERE id = p_booking_id;
  
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  -- Verificar que la reserva está en estado 'reserved'
  IF v_booking.status != 'reserved' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservas en estado "reserved"';
  END IF;

  -- Obtener la sesión
  SELECT * INTO v_session 
  FROM sessions 
  WHERE id = v_booking.session_id;
  
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  -- Obtener el ID del estudiante
  v_student_id := v_booking.user_id;

  -- Cambiar el estado de la reserva a 'cancelled'
  UPDATE bookings 
  SET status = 'cancelled'
  WHERE id = p_booking_id;

  -- Devolver el crédito al estudiante
  UPDATE profiles 
  SET classes_remaining = classes_remaining + 1 
  WHERE id = v_student_id;

END;
$$;

-- Otorgar permisos a usuarios autenticados
GRANT EXECUTE ON FUNCTION admin_cancel_booking(uuid) TO authenticated;

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Abre el editor SQL de Supabase (SQL Editor)
-- 2. Copia y pega este archivo completo
-- 3. Ejecuta el script
-- 4. La función admin_cancel_booking estará disponible para el admin
-- ====================================================================
