-- ============================================================================
-- Función: get_my_next_booking
-- Fecha: 2025-11-05
-- Descripción: Obtiene la próxima reserva activa del usuario autenticado
--              Retorna un único objeto JSON con start_at y distance_m
--              Usado en el dashboard del alumno para mostrar "Próxima Reserva"
-- ============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS get_my_next_booking();

-- Crear función que retorna la próxima reserva del usuario
CREATE OR REPLACE FUNCTION get_my_next_booking()
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER  -- Se ejecuta con permisos del usuario logueado
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- 1. Obtener el ID del usuario autenticado
  v_user_id := auth.uid();
  
  -- 2. Verificar que hay un usuario autenticado
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Buscar la próxima reserva activa del usuario
  SELECT json_build_object(
    'start_at', s.start_at,
    'distance_m', b.distance_m
  )
  INTO v_result
  FROM bookings b
  INNER JOIN sessions s ON s.id = b.session_id
  WHERE 
    b.user_id = v_user_id
    AND b.status = 'reserved'
    AND s.start_at >= NOW()
  ORDER BY s.start_at ASC
  LIMIT 1;

  -- 4. Retornar el resultado (puede ser NULL si no hay reservas)
  RETURN v_result;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_my_next_booking TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION get_my_next_booking IS 
  'Retorna la próxima reserva activa del usuario autenticado.
   Solo incluye reservas con status = reserved y fecha futura.
   Retorna JSON: { start_at, distance_m } o NULL si no hay reservas.
   Se ejecuta con permisos del usuario (SECURITY INVOKER).';

-- ============================================================================
-- VERIFICACIÓN Y PRUEBAS
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type, security_type
-- FROM information_schema.routines 
-- WHERE routine_name = 'get_my_next_booking';

-- Probar la función (ejecutar como alumno):
-- SELECT * FROM get_my_next_booking();

-- Resultado esperado (ejemplo con reserva):
-- {
--   "start_at": "2025-11-06T16:00:00+00:00",
--   "distance_m": 30
-- }

-- Resultado esperado (sin reservas):
-- null

-- ============================================================================
-- USO EN NEXT.JS
-- ============================================================================
-- 
-- const { data, error } = await supabase.rpc('get_my_next_booking')
-- 
-- if (error) {
--   console.error('Error:', error)
-- } else if (data) {
--   console.log('Próxima reserva:', data)
--   console.log('Fecha:', new Date(data.start_at))
--   console.log('Distancia:', data.distance_m + 'm')
-- } else {
--   console.log('No tienes reservas próximas')
-- }
-- ============================================================================

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 
-- 1. Usa SECURITY INVOKER (se ejecuta con permisos del usuario)
-- 2. Filtra automáticamente por auth.uid() - el usuario solo ve sus reservas
-- 3. Solo incluye reservas con status = 'reserved' (activas)
-- 4. Solo incluye reservas futuras (start_at >= NOW())
-- 5. Retorna la más cercana (ORDER BY start_at ASC LIMIT 1)
-- 6. Retorna NULL si no hay reservas (no es un error)
-- 7. Retorna JSON con start_at (timestamp) y distance_m (integer)
-- 
-- ============================================================================
