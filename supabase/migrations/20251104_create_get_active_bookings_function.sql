-- ============================================================================
-- Función: get_active_bookings
-- Fecha: 2025-11-04
-- Descripción: Obtiene las próximas 5 reservas activas para el dashboard
--              Bypasa RLS con SECURITY DEFINER para acceso desde cliente
-- ============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS get_active_bookings();

-- Crear función que retorna las reservas activas
CREATE OR REPLACE FUNCTION get_active_bookings()
RETURNS TABLE (
  id uuid,
  full_name text,
  start_at timestamptz,
  distance_m integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    p.full_name,
    s.start_at,
    b.distance_m
  FROM bookings b
  INNER JOIN profiles p ON b.profile_id = p.id
  INNER JOIN sessions s ON b.session_id = s.id
  WHERE b.status = 'reserved'
    AND s.start_at >= NOW()
  ORDER BY s.start_at ASC
  LIMIT 5;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_active_bookings() TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION get_active_bookings IS 
  'Retorna las próximas 5 reservas activas (futuras) con información del alumno y horario.
   Utiliza SECURITY DEFINER para bypasear RLS y permitir acceso desde el cliente.
   Retorna: id (uuid), full_name (text), start_at (timestamptz), distance_m (integer).';

-- ============================================================================
-- VERIFICACIÓN Y PRUEBAS
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_name = 'get_active_bookings';

-- Probar la función (ejecutar como admin):
-- SELECT * FROM get_active_bookings();

-- Resultado esperado (ejemplo):
-- id                                    | full_name      | start_at                  | distance_m
-- --------------------------------------|----------------|---------------------------|------------
-- a1b2c3d4-e5f6-7890-abcd-ef1234567890 | Juan Pérez     | 2025-11-05 10:00:00+00   | 18
-- b2c3d4e5-f6a7-8901-bcde-f12345678901 | María García   | 2025-11-05 14:30:00+00   | 30
-- c3d4e5f6-a7b8-9012-cdef-123456789012 | Carlos López   | 2025-11-06 09:00:00+00   | 50
-- d4e5f6a7-b8c9-0123-def1-234567890123 | Ana Martínez   | 2025-11-06 16:00:00+00   | 18
-- e5f6a7b8-c9d0-1234-ef12-345678901234 | Pedro Sánchez  | 2025-11-07 11:00:00+00   | 30

-- ============================================================================
-- USO EN NEXT.JS
-- ============================================================================
-- 
-- // Reemplazar la consulta directa en ActiveBookingsWidget.tsx:
-- 
-- // ANTES (bloqueado por RLS):
-- // const { data } = await supabase
-- //   .from('bookings')
-- //   .select('...')
-- //   .eq('status', 'reserved')
-- 
-- // DESPUÉS (usando RPC):
-- const { data, error } = await supabase.rpc('get_active_bookings')
-- 
-- if (error) {
--   console.error('Error:', error)
-- } else {
--   console.log('Próximas reservas:', data)
--   // data es un array de objetos con: id, full_name, start_at, distance_m
-- }
-- ============================================================================
