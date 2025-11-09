-- ============================================================================
-- Función: get_my_booking_history_paginated
-- Fecha: 2025-11-06
-- Descripción: Obtiene el historial de reservas del usuario autenticado con paginación
--              Retorna una tabla con booking_id, start_at y status
--              Usado en el dashboard del alumno para mostrar el historial
-- ============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS get_my_booking_history_paginated(integer, integer);

-- Crear función que retorna el historial paginado
CREATE OR REPLACE FUNCTION get_my_booking_history_paginated(
  page_number integer,
  page_size integer
)
RETURNS TABLE(
  booking_id uuid,
  start_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY INVOKER  -- Se ejecuta con permisos del usuario logueado
AS $$
DECLARE
  v_user_id uuid;
  v_offset integer;
BEGIN
  -- 1. Obtener el ID del usuario autenticado
  v_user_id := auth.uid();
  
  -- 2. Verificar que hay un usuario autenticado
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 3. Validar parámetros de paginación
  IF page_number < 1 THEN
    RAISE EXCEPTION 'page_number debe ser mayor o igual a 1';
  END IF;

  IF page_size < 1 OR page_size > 100 THEN
    RAISE EXCEPTION 'page_size debe estar entre 1 y 100';
  END IF;

  -- 4. Calcular el offset
  v_offset := (page_number - 1) * page_size;

  -- 5. Retornar el historial paginado
  RETURN QUERY
  SELECT 
    b.id::uuid AS booking_id,
    s.start_at::timestamptz AS start_at,
    b.status::text AS status
  FROM bookings b
  INNER JOIN sessions s ON s.id = b.session_id
  WHERE b.user_id = v_user_id
  ORDER BY s.start_at DESC
  LIMIT page_size
  OFFSET v_offset;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_my_booking_history_paginated(integer, integer) TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION get_my_booking_history_paginated(integer, integer) IS 
  'Retorna el historial de reservas del usuario autenticado con paginación.
   Parámetros:
   - page_number: número de página (1-indexed)
   - page_size: cantidad de registros por página (máximo 100)
   Retorna: TABLE(booking_id uuid, start_at timestamptz, status text)
   Ordena por fecha descendente (más recientes primero).
   Se ejecuta con permisos del usuario (SECURITY INVOKER).';

-- ============================================================================
-- VERIFICACIÓN Y PRUEBAS
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type, security_type
-- FROM information_schema.routines 
-- WHERE routine_name = 'get_my_booking_history_paginated';

-- Probar la función (ejecutar como alumno):
-- SELECT * FROM get_my_booking_history_paginated(1, 10);  -- Primera página, 10 registros
-- SELECT * FROM get_my_booking_history_paginated(2, 10);  -- Segunda página, 10 registros

-- Resultado esperado (ejemplo):
-- booking_id                            | start_at                    | status
-- --------------------------------------+-----------------------------+-----------
-- a1b2c3d4-e5f6-7890-abcd-ef1234567890 | 2025-11-05 16:00:00+00     | attended
-- b2c3d4e5-f6a7-8901-bcde-f12345678901 | 2025-11-04 18:00:00+00     | attended
-- c3d4e5f6-a7b8-9012-cdef-123456789012 | 2025-11-03 16:00:00+00     | no_show
-- ...

-- ============================================================================
-- USO EN NEXT.JS
-- ============================================================================
-- 
-- // Obtener primera página (10 registros)
-- const { data, error } = await supabase.rpc('get_my_booking_history_paginated', {
--   page_number: 1,
--   page_size: 10
-- })
-- 
-- if (error) {
--   console.error('Error:', error)
-- } else {
--   console.log('Historial página 1:', data)
--   data.forEach(booking => {
--     console.log(`${booking.booking_id}: ${new Date(booking.start_at).toLocaleDateString()} - ${booking.status}`)
--   })
-- }
--
-- // Ejemplo de uso con paginación:
-- const [page, setPage] = useState(1)
-- const PAGE_SIZE = 10
-- 
-- const fetchHistory = async () => {
--   const { data, error } = await supabase.rpc('get_my_booking_history_paginated', {
--     page_number: page,
--     page_size: PAGE_SIZE
--   })
--   // ... manejar data
-- }
-- ============================================================================

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 
-- 1. Usa SECURITY INVOKER (se ejecuta con permisos del usuario)
-- 2. Filtra automáticamente por auth.uid() - el usuario solo ve sus reservas
-- 3. Incluye todas las reservas (reserved, attended, no_show, cancelled)
-- 4. Ordenadas por fecha descendente (más recientes primero)
-- 5. Paginación: page_number empieza en 1, no en 0
-- 6. page_size máximo: 100 registros por seguridad
-- 7. Retorna array vacío si no hay más registros (no es un error)
-- 8. Lanza excepción si usuario no autenticado o parámetros inválidos
-- 
-- ============================================================================
