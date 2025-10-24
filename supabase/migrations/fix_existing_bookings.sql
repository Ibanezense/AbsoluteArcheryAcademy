-- ====================================================================
-- DIAGNÓSTICO Y CORRECCIÓN DE RESERVAS EXISTENTES
-- ====================================================================
-- Este script diagnostica reservas sin distance_m/group_type
-- y permite corregirlas basándose en el perfil del estudiante
-- ====================================================================

-- 1. Ver reservas sin distance_m o group_type
SELECT 
  b.id AS booking_id,
  b.created_at,
  b.session_id,
  b.distance_m,
  b.group_type,
  p.full_name AS student_name,
  p.distance_m AS student_distance,
  p.group_type AS student_group,
  s.start_at AS session_time
FROM bookings b
JOIN profiles p ON p.id = b.user_id
JOIN sessions s ON s.id = b.session_id
WHERE b.status = 'reserved'
  AND (b.distance_m IS NULL OR b.group_type IS NULL);

-- 2. Ver estudiantes sin distance_m o group_type configurado
SELECT 
  id,
  full_name,
  distance_m,
  group_type,
  classes_remaining
FROM profiles
WHERE role = 'student'
  AND (distance_m IS NULL OR group_type IS NULL);

-- ====================================================================
-- CORRECCIÓN AUTOMÁTICA (ejecutar SOLO si los estudiantes ya tienen
-- distance_m y group_type configurados en sus perfiles)
-- ====================================================================

-- Actualizar reservas existentes copiando distance_m y group_type del perfil
UPDATE bookings
SET 
  distance_m = p.distance_m,
  group_type = p.group_type
FROM profiles p
WHERE bookings.user_id = p.id
  AND bookings.status = 'reserved'
  AND (bookings.distance_m IS NULL OR bookings.group_type IS NULL)
  AND p.distance_m IS NOT NULL
  AND p.group_type IS NOT NULL;

-- Verificar resultados
SELECT 
  COUNT(*) FILTER (WHERE distance_m IS NOT NULL) AS with_distance,
  COUNT(*) FILTER (WHERE distance_m IS NULL) AS without_distance,
  COUNT(*) FILTER (WHERE group_type IS NOT NULL) AS with_group,
  COUNT(*) FILTER (WHERE group_type IS NULL) AS without_group
FROM bookings
WHERE status = 'reserved';

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Ejecuta SOLO las queries SELECT primero para ver el diagnóstico
-- 2. Configura distance_m y group_type para cada estudiante en su perfil
-- 3. Luego ejecuta el UPDATE para corregir las reservas existentes
-- 4. Verifica con las queries de diagnóstico que todo esté correcto
-- ====================================================================
