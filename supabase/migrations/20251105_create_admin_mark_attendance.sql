-- ============================================================================
-- Función: admin_mark_attendance
-- Fecha: 2025-11-05
-- Descripción: Marca asistencia de un alumno en un turno (attended/no_show)
--              Solo actualiza el estado del booking, NO descuenta clases
--              (las clases ya fueron descontadas al momento de reservar)
-- ============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS admin_mark_attendance(uuid, boolean);

-- Crear función para marcar asistencia
CREATE OR REPLACE FUNCTION admin_mark_attendance(
  p_booking_id UUID,
  p_attended BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_booking_status TEXT;
  v_new_status TEXT;
  v_profile_id UUID;
  v_session_id UUID;
  v_result JSON;
BEGIN
  -- 1. Obtener el ID del usuario que ejecuta la función
  v_admin_id := auth.uid();
  
  -- 2. Verificar que el usuario es admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = v_admin_id 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar asistencia';
  END IF;

  -- 3. Verificar que el booking existe y obtener su información
  SELECT status, profile_id, session_id
  INTO v_booking_status, v_profile_id, v_session_id
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  -- 4. Determinar el nuevo estado según p_attended
  IF p_attended THEN
    v_new_status := 'attended';
  ELSE
    v_new_status := 'no_show';
  END IF;

  -- 5. Actualizar el estado del booking
  UPDATE bookings
  SET 
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_booking_id;

  -- 6. Registrar en attendance_audit para trazabilidad
  INSERT INTO attendance_audit (
    booking_id,
    profile_id,
    session_id,
    previous_status,
    new_status,
    marked_by,
    marked_at
  ) VALUES (
    p_booking_id,
    v_profile_id,
    v_session_id,
    v_booking_status,
    v_new_status,
    v_admin_id,
    NOW()
  );

  -- 7. Construir respuesta JSON
  v_result := json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'previous_status', v_booking_status,
    'new_status', v_new_status,
    'message', CASE 
      WHEN p_attended THEN 'Asistencia marcada correctamente'
      ELSE 'Marcado como no asistió'
    END
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Capturar cualquier error y retornarlo como JSON
    v_result := json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
    RETURN v_result;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
-- (la función valida internamente que sea admin)
GRANT EXECUTE ON FUNCTION admin_mark_attendance TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION admin_mark_attendance IS 
  'Marca asistencia de un alumno en un turno. 
   Solo admins pueden ejecutarla.
   p_attended = true → status = "attended"
   p_attended = false → status = "no_show"
   NO descuenta clases (ya fueron descontadas al reservar).
   Registra auditoría en attendance_audit.';

-- ============================================================================
-- VERIFICACIÓN Y PRUEBAS
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_name = 'admin_mark_attendance';

-- Probar la función (ejecutar como admin):
-- SELECT * FROM admin_mark_attendance(
--   'booking-uuid-aqui'::uuid,
--   true  -- true = asistió, false = no asistió
-- );

-- Resultado esperado (ejemplo):
-- {
--   "success": true,
--   "booking_id": "123e4567-e89b-12d3-a456-426614174000",
--   "previous_status": "confirmed",
--   "new_status": "attended",
--   "message": "Asistencia marcada correctamente"
-- }

-- ============================================================================
-- USO EN NEXT.JS
-- ============================================================================
-- 
-- // Marcar como asistió
-- const { data, error } = await supabase.rpc('admin_mark_attendance', {
--   p_booking_id: 'uuid-del-booking',
--   p_attended: true
-- })
-- 
-- if (error) {
--   console.error('Error:', error)
-- } else if (data.success) {
--   console.log(data.message)
-- } else {
--   console.error('Error:', data.error)
-- }
--
-- // Marcar como no asistió
-- const { data, error } = await supabase.rpc('admin_mark_attendance', {
--   p_booking_id: 'uuid-del-booking',
--   p_attended: false
-- })
-- ============================================================================

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 
-- 1. Esta función SOLO actualiza el estado del booking
-- 2. NO descuenta ni devuelve clases (ya fueron descontadas al reservar)
-- 3. Registra auditoría completa en attendance_audit
-- 4. Solo admins pueden ejecutarla (valida role = 'admin')
-- 5. Retorna JSON con success/error para manejo en frontend
-- 6. Estados válidos: 'attended' (asistió) o 'no_show' (no asistió)
-- 
-- ============================================================================
