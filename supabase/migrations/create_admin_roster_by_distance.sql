-- ====================================================================
-- VISTA: admin_roster_by_distance
-- ====================================================================
-- Vista que muestra la capacidad y reservas por distancia para cada sesión
-- Utilizada en la página de turnos para mostrar ocupación
-- NOTA: Esta vista ahora cuenta reservas reales por distancia
-- ====================================================================

DROP VIEW IF EXISTS admin_roster_by_distance CASCADE;

CREATE OR REPLACE VIEW admin_roster_by_distance AS
SELECT
  s.id AS session_id,
  sda.distance_m,
  sda.targets,
  -- Contar reservas activas para esta sesión en esta distancia específica
  COALESCE((
    SELECT COUNT(*)
    FROM bookings b
    WHERE b.session_id = s.id
      AND b.status = 'reserved'
      AND b.distance_m = sda.distance_m
  ), 0)::int AS reserved_count
FROM sessions s
CROSS JOIN session_distance_allocations sda
WHERE sda.session_id = s.id
ORDER BY s.id, sda.distance_m;

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Abre el editor SQL de Supabase (SQL Editor)
-- 2. Copia y pega este archivo completo
-- 3. Ejecuta el script
-- 4. La vista mostrará correctamente los cupos ocupados en la página de turnos
-- ====================================================================
