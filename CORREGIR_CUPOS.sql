-- ====================================================================
-- RESTAURAR CUPOS CORRECTOS
-- ====================================================================
-- Los scripts anteriores corrompieron los datos.
-- Este script restaura los valores correctos basándose en la configuracion
-- real de la academia: 10 pacas distribuidas por distancia.
--
-- Configuracion correcta por turno:
--   10m: 3 pacas = 12 cupos
--   15m: 2 pacas =  8 cupos
--   20m: 1 paca  =  4 cupos
--   30m: 1 paca  =  4 cupos
--   40m: 1 paca  =  4 cupos
--   50m: 1 paca  =  4 cupos
--   70m: 1 paca  =  4 cupos
--   TOTAL: 10 pacas = 40 cupos
-- ====================================================================

-- 1. Fix plantillas semanales
UPDATE public.weekly_session_template_distances
SET targets = CASE distance_m
    WHEN 10 THEN 3
    WHEN 15 THEN 2
    ELSE 1
  END,
  slot_capacity = CASE distance_m
    WHEN 10 THEN 12
    WHEN 15 THEN 8
    ELSE 4
  END;

-- 2. Fix sesiones reales (TODAS las sesiones)
UPDATE public.session_distance_allocations
SET targets = CASE distance_m
    WHEN 10 THEN 3
    WHEN 15 THEN 2
    ELSE 1
  END,
  slot_capacity = CASE distance_m
    WHEN 10 THEN 12
    WHEN 15 THEN 8
    ELSE 4
  END;

-- 3. Verificar
SELECT 'Plantillas' as origen, distance_m, targets as pacas, slot_capacity as cupos
FROM weekly_session_template_distances
ORDER BY distance_m
LIMIT 7;

SELECT 'Sesion ejemplo' as origen, s.start_at::date, sda.distance_m, sda.targets as pacas, sda.slot_capacity as cupos
FROM session_distance_allocations sda
JOIN sessions s ON s.id = sda.session_id
WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = '2026-03-12'
ORDER BY sda.distance_m;
