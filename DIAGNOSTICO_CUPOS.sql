-- ====================================================================
-- DIAGNÓSTICO COMPLETO DE CUPOS
-- ====================================================================
-- Este script te muestra EXACTAMENTE por qué aparecen 2 o 4 cupos
-- ====================================================================

-- 1. Ver configuración de CAPACIDADES POR GRUPO en las sesiones
SELECT 
  start_at,
  capacity_children AS cap_niños,
  capacity_youth AS cap_jovenes,
  capacity_adult AS cap_adultos,
  capacity_assigned AS cap_asignados,
  capacity_ownbow AS cap_arco_propio
FROM sessions
WHERE start_at >= NOW()
ORDER BY start_at
LIMIT 10;

-- 2. Ver configuración de TARGETS (PACAS) por distancia
SELECT 
  s.start_at,
  sda.distance_m,
  sda.targets AS pacas,
  (sda.targets * 4) AS cupos_por_distancia
FROM session_distance_allocations sda
JOIN sessions s ON s.id = sda.session_id
WHERE s.start_at >= NOW()
ORDER BY s.start_at, sda.distance_m
LIMIT 20;

-- 3. Ver cupos REALES calculados por la vista sessions_with_availability
SELECT 
  start_at,
  spots_children AS cupos_niños,
  spots_youth AS cupos_jovenes,
  spots_adult AS cupos_adultos,
  spots_assigned AS cupos_asignados,
  spots_ownbow AS cupos_arco_propio
FROM sessions_with_availability
WHERE start_at >= NOW()
ORDER BY start_at
LIMIT 10;

-- 4. Ver cupos por DISTANCIA calculados por session_distance_availability
SELECT 
  start_at,
  distance_m,
  spots_distance AS cupos_disponibles_distancia
FROM session_distance_availability
WHERE start_at >= NOW()
ORDER BY start_at, distance_m
LIMIT 20;

-- ====================================================================
-- 🔍 INTERPRETACIÓN
-- ====================================================================
-- El problema está en la QUERY 1:
-- Si ves capacity_children = 2, capacity_youth = 4, etc.
-- Esos valores SON EL LÍMITE, no importa cuántas pacas tengas.
-- 
-- El frontend hace: Math.min(capacity_group, capacity_distance)
-- Entonces si capacity_youth = 4 y capacity_distance = 16
-- El resultado será 4 (el mínimo).
--
-- SOLUCIÓN: Actualizar las columnas capacity_* en la tabla sessions
-- para que reflejen la capacidad REAL de tu infraestructura.
-- ====================================================================
