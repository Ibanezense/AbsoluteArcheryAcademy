-- ====================================================================
-- SCRIPT RÁPIDO: SOLO ACTUALIZAR VISTAS
-- ====================================================================
-- Este script SOLAMENTE actualiza las vistas para calcular cupos correctamente
-- Ejecuta esto si ya ejecutaste el script principal pero los cupos siguen mal
-- ====================================================================

-- 1. ELIMINAR VISTAS ANTIGUAS
DROP VIEW IF EXISTS sessions_with_availability CASCADE;
DROP VIEW IF EXISTS session_distance_availability CASCADE;

-- 2. RECREAR sessions_with_availability CON CAPACIDADES POR GRUPO
CREATE OR REPLACE VIEW sessions_with_availability AS
SELECT
  s.id,
  s.start_at,
  s.end_at,
  s.status,
  s.coach_id,
  s.capacity_children,
  s.capacity_youth,
  s.capacity_adult,
  s.capacity_assigned,
  s.capacity_ownbow,
  -- Calcular cupos disponibles por grupo
  (s.capacity_children - COALESCE((
    SELECT COUNT(*) FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.status = 'reserved' 
      AND b.group_type = 'children'
  ), 0))::int AS spots_children,
  (s.capacity_youth - COALESCE((
    SELECT COUNT(*) FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.status = 'reserved' 
      AND b.group_type = 'youth'
  ), 0))::int AS spots_youth,
  (s.capacity_adult - COALESCE((
    SELECT COUNT(*) FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.status = 'reserved' 
      AND b.group_type = 'adult'
  ), 0))::int AS spots_adult,
  (s.capacity_assigned - COALESCE((
    SELECT COUNT(*) FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.status = 'reserved' 
      AND b.group_type = 'assigned'
  ), 0))::int AS spots_assigned,
  (s.capacity_ownbow - COALESCE((
    SELECT COUNT(*) FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.status = 'reserved' 
      AND b.group_type = 'ownbow'
  ), 0))::int AS spots_ownbow
FROM sessions s;

-- 3. RECREAR session_distance_availability
CREATE OR REPLACE VIEW session_distance_availability AS
SELECT
  s.id AS session_id,
  s.start_at,
  s.end_at,
  sda.distance_m,
  sda.targets,
  (sda.targets * 4) AS capacity_distance,
  ((sda.targets * 4) - COALESCE((
    SELECT COUNT(*) FROM bookings b 
    WHERE b.session_id = s.id 
      AND b.distance_m = sda.distance_m 
      AND b.status = 'reserved'
  ), 0))::int AS spots_distance
FROM sessions s
JOIN session_distance_allocations sda ON sda.session_id = s.id;

-- 4. VERIFICAR RESULTADOS
SELECT 
  s.start_at,
  sda.distance_m,
  sda.targets AS pacas,
  (sda.targets * 4) AS cupos_totales,
  COUNT(b.id) AS reservas,
  ((sda.targets * 4) - COUNT(b.id)) AS cupos_disponibles
FROM session_distance_allocations sda
JOIN sessions s ON s.id = sda.session_id
LEFT JOIN bookings b ON b.session_id = sda.session_id 
  AND b.distance_m = sda.distance_m 
  AND b.status = 'reserved'
WHERE s.start_at >= NOW()
GROUP BY s.start_at, sda.distance_m, sda.targets
ORDER BY s.start_at, sda.distance_m
LIMIT 10;

-- ====================================================================
-- ✅ VERIFICAR
-- ====================================================================
-- Si ves "cupos_totales = 16" y "cupos_disponibles = 16" (o menos según reservas),
-- entonces las vistas están correctas.
-- Recarga la app de estudiantes (Ctrl+F5) para ver los cambios.
-- ====================================================================
