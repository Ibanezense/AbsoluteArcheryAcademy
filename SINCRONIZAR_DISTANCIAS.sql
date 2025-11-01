-- ====================================================================
-- SINCRONIZAR COLUMNAS DE DISTANCIA EN PROFILES
-- ====================================================================
-- Problema: El admin guarda en distance_m pero el frontend lee current_distance
-- Solución: Sincronizar ambas columnas
-- ====================================================================

-- 1. Copiar distance_m a current_distance para todos los usuarios
UPDATE profiles
SET current_distance = distance_m
WHERE distance_m IS NOT NULL
  AND (current_distance IS NULL OR current_distance != distance_m);

-- 2. Verificar que se sincronizó correctamente
SELECT 
  full_name,
  email,
  distance_m AS admin_guarda_aqui,
  current_distance AS frontend_lee_aqui,
  CASE 
    WHEN distance_m = current_distance THEN '✅ Sincronizado'
    WHEN distance_m IS NULL AND current_distance IS NULL THEN '⚠️ Ambos NULL'
    ELSE '❌ Desincronizado'
  END AS estado
FROM profiles
ORDER BY full_name;

-- 3. OPCIONAL: Crear un trigger para mantener sincronizado automáticamente
CREATE OR REPLACE FUNCTION sync_distance_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Si se actualiza distance_m, copiar a current_distance
  IF NEW.distance_m IS DISTINCT FROM OLD.distance_m THEN
    NEW.current_distance = NEW.distance_m;
  END IF;
  
  -- Si se actualiza current_distance, copiar a distance_m
  IF NEW.current_distance IS DISTINCT FROM OLD.current_distance THEN
    NEW.distance_m = NEW.current_distance;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_distance ON profiles;
CREATE TRIGGER trg_sync_distance
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_distance_columns();

-- ====================================================================
-- ✅ LISTO
-- ====================================================================
-- Ejecuta este script y luego recarga la app de estudiantes.
-- Ahora debería ver los 16 cupos a 20m correctamente.
-- ====================================================================
