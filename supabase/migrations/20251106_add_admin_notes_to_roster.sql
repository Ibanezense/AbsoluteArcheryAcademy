-- ============================================================================
-- Migración: Agregar admin_notes a get_daily_roster
-- Fecha: 2025-11-06
-- Descripción: Modifica la función get_daily_roster para incluir admin_notes
--              de la tabla bookings, permitiendo a los instructores ver
--              detalles importantes de cada reserva
-- ============================================================================

-- Eliminar función existente para poder cambiar el tipo de retorno
DROP FUNCTION IF EXISTS get_daily_roster(date);

-- Recrear función get_daily_roster con admin_notes
CREATE OR REPLACE FUNCTION get_daily_roster(p_date DATE)
RETURNS TABLE (
  booking_id UUID,
  session_id UUID,
  session_start_at TIMESTAMPTZ,
  student_name TEXT,
  student_avatar_url TEXT,
  booking_status TEXT,
  admin_notes TEXT
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
    b.id::UUID AS booking_id,
    b.session_id::UUID,
    s.start_at::TIMESTAMPTZ AS session_start_at,
    p.full_name::TEXT AS student_name,
    COALESCE(p.avatar_url, '')::TEXT AS student_avatar_url,
    b.status::TEXT AS booking_status,
    b.admin_notes::TEXT AS admin_notes
  FROM bookings b
  INNER JOIN sessions s ON s.id = b.session_id
  INNER JOIN profiles p ON p.id = b.user_id
  WHERE 
    -- Filtrar por fecha en timezone America/Lima
    DATE(s.start_at AT TIME ZONE 'America/Lima') = p_date
    -- Incluir solo bookings reservadas o con asistencia marcada
    AND b.status IN ('reserved', 'attended', 'no_show')
  ORDER BY 
    s.start_at ASC,          -- Primero por hora del turno
    p.full_name ASC;         -- Luego alfabéticamente por nombre
END;
$$;

-- Comentario actualizado
COMMENT ON FUNCTION get_daily_roster IS 
  'Retorna el roster (lista de asistencia) de un día específico.
   Solo admins pueden ejecutarla.
   Incluye: booking_id, session_id, hora del turno, nombre del alumno, avatar, estado, admin_notes.
   Ordenado por hora de turno y luego alfabéticamente.
   Timezone: America/Lima (UTC-5).';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Probar la función (ejecutar como admin):
-- SELECT * FROM get_daily_roster('2025-11-06');

-- Resultado esperado ahora incluye admin_notes:
-- booking_id | session_id | session_start_at | student_name | student_avatar_url | booking_status | admin_notes
-- -----------|------------|------------------|--------------|--------------------|--------------|---------------------------------
-- ...        | ...        | 2025-11-06 16:00 | Ana García   | https://...        | confirmed    | Viene con equipo propio
-- ...        | ...        | 2025-11-06 16:00 | Carlos Ruiz  | https://...        | attended     | NULL
-- ...        | ...        | 2025-11-06 17:30 | María López  | https://...        | no_show      | Primera clase, necesita inducción

-- ============================================================================
