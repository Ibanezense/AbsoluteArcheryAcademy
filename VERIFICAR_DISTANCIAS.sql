-- ====================================================================
-- VERIFICAR ASIGNACIONES DE DISTANCIA PARA SESIONES ESPECÍFICAS
-- ====================================================================
-- Este script verifica si TODAS las sesiones tienen asignaciones de distancia
-- ====================================================================

-- 1. Ver sesiones SIN asignaciones de distancia
SELECT 
  s.id,
  s.start_at,
  s.status,
  COUNT(sda.session_id) AS num_distancias_configuradas
FROM sessions s
LEFT JOIN session_distance_allocations sda ON sda.session_id = s.id
WHERE s.start_at >= NOW()
GROUP BY s.id, s.start_at, s.status
HAVING COUNT(sda.session_id) = 0
ORDER BY s.start_at
LIMIT 10;

-- 2. Ver TODAS las sesiones con sus asignaciones de distancia
SELECT 
  s.start_at,
  s.id AS session_id,
  STRING_AGG(sda.distance_m::text || 'm (' || sda.targets || ' pacas)', ', ' ORDER BY sda.distance_m) AS distancias_configuradas
FROM sessions s
LEFT JOIN session_distance_allocations sda ON sda.session_id = s.id
WHERE s.start_at >= NOW()
GROUP BY s.id, s.start_at
ORDER BY s.start_at
LIMIT 20;

-- 3. Ver cupos disponibles a 20m para las próximas sesiones
SELECT 
  s.start_at,
  s.id AS session_id,
  sda.distance_m,
  sda.targets AS pacas,
  (sda.targets * 4) AS capacidad_total,
  COUNT(b.id) AS reservas_hechas,
  ((sda.targets * 4) - COUNT(b.id)) AS cupos_disponibles
FROM sessions s
JOIN session_distance_allocations sda ON sda.session_id = s.id
LEFT JOIN bookings b ON b.session_id = s.id 
  AND b.distance_m = sda.distance_m 
  AND b.status = 'reserved'
WHERE s.start_at >= NOW()
  AND sda.distance_m = 20
GROUP BY s.start_at, s.id, sda.distance_m, sda.targets
ORDER BY s.start_at
LIMIT 20;

-- ====================================================================
-- 🔍 INTERPRETACIÓN
-- ====================================================================
-- QUERY 1: Si muestra sesiones, esas NO tienen distancias configuradas
-- QUERY 2: Muestra todas las sesiones y sus distancias asignadas
-- QUERY 3: Específicamente para 20m - verifica cupos reales
-- ====================================================================
