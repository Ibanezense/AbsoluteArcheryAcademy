-- ====================================================================
-- FIX: Actualizar vista sessions_with_availability
-- ====================================================================
-- La vista debe incluir spots_left calculado correctamente

-- Eliminar vista existente
DROP VIEW IF EXISTS sessions_with_availability CASCADE;

-- Recrear vista con la columna spots_left
CREATE OR REPLACE VIEW sessions_with_availability AS
SELECT
  s.id,
  s.start_at,
  s.end_at,
  s.coach_id,
  s.distance,
  s.capacity,
  s.status,
  s.notes,
  s.created_at,
  (s.capacity - COALESCE((
    SELECT COUNT(*) 
    FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.status = 'reserved'
  ), 0))::int AS spots_left,
  (SELECT full_name FROM profiles p WHERE p.id = s.coach_id) AS instructor_name
FROM sessions s;

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Abre el editor SQL de Supabase (SQL Editor)
-- 2. Copia y pega este archivo completo
-- 3. Ejecuta el script
-- 4. La vista ahora incluirá la columna spots_left correctamente
-- ====================================================================
