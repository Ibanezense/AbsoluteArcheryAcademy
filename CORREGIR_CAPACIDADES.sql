-- ====================================================================
-- CORREGIR CAPACIDADES POR GRUPO EN SESIONES
-- ====================================================================
-- Este script actualiza las capacidades por grupo para reflejar
-- la capacidad real de tu infraestructura
-- ====================================================================

-- IMPORTANTE: Ajusta estos valores según tu academia
-- Si tienes 8 pacas (32 plazas totales), puedes distribuir así:
-- - Niños: 8-10 plazas
-- - Jóvenes: 10-12 plazas  
-- - Adultos: 10-12 plazas
-- - Asignados (arco asignado): 8-10 plazas
-- - Arco propio: sin límite (32 o más)

-- OPCIÓN 1: Actualizar TODAS las sesiones futuras con valores generosos
UPDATE sessions
SET 
  capacity_children = 10,
  capacity_youth = 12,
  capacity_adult = 12,
  capacity_assigned = 10,
  capacity_ownbow = 32
WHERE start_at >= NOW();

-- OPCIÓN 2: Si prefieres valores más conservadores
-- UPDATE sessions
-- SET 
--   capacity_children = 6,
--   capacity_youth = 8,
--   capacity_adult = 10,
--   capacity_assigned = 6,
--   capacity_ownbow = 24
-- WHERE start_at >= NOW();

-- OPCIÓN 3: Actualizar solo las sesiones de noviembre 2025
-- UPDATE sessions
-- SET 
--   capacity_children = 10,
--   capacity_youth = 12,
--   capacity_adult = 12,
--   capacity_assigned = 10,
--   capacity_ownbow = 32
-- WHERE start_at >= '2025-11-01' AND start_at < '2025-12-01';

-- VERIFICAR RESULTADOS
SELECT 
  start_at,
  capacity_children AS niños,
  capacity_youth AS jovenes,
  capacity_adult AS adultos,
  capacity_assigned AS asignados,
  capacity_ownbow AS arco_propio
FROM sessions
WHERE start_at >= NOW()
ORDER BY start_at
LIMIT 10;

-- ====================================================================
-- ✅ DESPUÉS DE EJECUTAR
-- ====================================================================
-- 1. Verifica que los valores se actualizaron correctamente
-- 2. Recarga la app de estudiantes (Ctrl+F5)
-- 3. Deberías ver más cupos disponibles (10-12 en lugar de 2-4)
-- ====================================================================
