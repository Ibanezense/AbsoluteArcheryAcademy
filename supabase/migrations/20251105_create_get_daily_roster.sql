-- ============================================================================
-- Función: get_daily_roster
-- Fecha: 2025-11-05
-- Descripción: Obtiene el roster (lista de asistencia) de un día específico
--              Devuelve todas las reservas del día con información del alumno
--              Usado en la página de gestión de asistencia diaria
-- ============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS get_daily_roster(date);

-- Crear función que retorna el roster diario
CREATE OR REPLACE FUNCTION get_daily_roster(p_date DATE)
RETURNS TABLE (
  booking_id UUID,
  session_id UUID,
  session_start_at TIMESTAMPTZ,
  student_name TEXT,
  student_avatar_url TEXT,
  booking_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- 1. Obtener el ID del usuario que ejecuta la función
  v_admin_id := auth.uid();
  
  -- 2. Verificar que el usuario es admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = v_admin_id 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden ver el roster diario';
  END IF;

  -- 3. Retornar el roster del día especificado
  RETURN QUERY
  SELECT 
    b.id AS booking_id,
    b.session_id,
    s.start_at AS session_start_at,
    p.full_name AS student_name,
    p.avatar_url AS student_avatar_url,
    b.status AS booking_status
  FROM bookings b
  INNER JOIN sessions s ON s.id = b.session_id
  INNER JOIN profiles p ON p.id = b.profile_id
  WHERE 
    -- Filtrar por fecha en timezone America/Lima
    DATE(s.start_at AT TIME ZONE 'America/Lima') = p_date
    -- Incluir solo bookings confirmadas o con asistencia marcada
    AND b.status IN ('confirmed', 'attended', 'no_show')
  ORDER BY 
    s.start_at ASC,          -- Primero por hora del turno
    p.full_name ASC;         -- Luego alfabéticamente por nombre
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
-- (la función valida internamente que sea admin)
GRANT EXECUTE ON FUNCTION get_daily_roster TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION get_daily_roster IS 
  'Retorna el roster (lista de asistencia) de un día específico.
   Solo admins pueden ejecutarla.
   Incluye: booking_id, session_id, hora del turno, nombre del alumno, avatar, estado.
   Ordenado por hora de turno y luego alfabéticamente.
   Timezone: America/Lima (UTC-5).';

-- ============================================================================
-- VERIFICACIÓN Y PRUEBAS
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_name = 'get_daily_roster';

-- Probar la función (ejecutar como admin):
-- SELECT * FROM get_daily_roster('2025-11-05');

-- Resultado esperado (ejemplo):
-- booking_id                            | session_id                           | session_start_at              | student_name      | student_avatar_url | booking_status
-- --------------------------------------|--------------------------------------|-------------------------------|-------------------|--------------------|--------------
-- 123e4567-e89b-12d3-a456-426614174001 | 123e4567-e89b-12d3-a456-426614174010 | 2025-11-05 16:00:00+00        | Ana García        | https://...        | confirmed
-- 123e4567-e89b-12d3-a456-426614174002 | 123e4567-e89b-12d3-a456-426614174010 | 2025-11-05 16:00:00+00        | Carlos Ruiz       | https://...        | attended
-- 123e4567-e89b-12d3-a456-426614174003 | 123e4567-e89b-12d3-a456-426614174011 | 2025-11-05 17:30:00+00        | María López       | https://...        | no_show

-- ============================================================================
-- USO EN NEXT.JS
-- ============================================================================
-- 
-- // Obtener roster de hoy
-- const today = new Date().toISOString().split('T')[0] // '2025-11-05'
-- const { data, error } = await supabase.rpc('get_daily_roster', {
--   p_date: today
-- })
-- 
-- if (error) {
--   console.error('Error:', error)
-- } else {
--   console.log('Roster del día:', data)
--   // data es un array de objetos con la estructura de la tabla
--   data.forEach(booking => {
--     console.log(`${booking.student_name} - ${booking.booking_status}`)
--   })
-- }
--
-- // Agrupar por turno en el frontend:
-- const groupedBySession = data.reduce((acc, booking) => {
--   const sessionId = booking.session_id
--   if (!acc[sessionId]) {
--     acc[sessionId] = {
--       session_start_at: booking.session_start_at,
--       bookings: []
--     }
--   }
--   acc[sessionId].bookings.push(booking)
--   return acc
-- }, {})
-- ============================================================================

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 
-- 1. La función filtra por fecha en timezone America/Lima (UTC-5)
-- 2. Solo incluye bookings con status: confirmed, attended, no_show
-- 3. Excluye bookings canceladas
-- 4. Ordena primero por hora del turno, luego alfabéticamente
-- 5. Solo admins pueden ejecutarla (valida role = 'admin')
-- 6. Retorna una tabla (RETURNS TABLE) lista para usar en el frontend
-- 7. Usa INNER JOIN para asegurar integridad de datos
-- 
-- ============================================================================
