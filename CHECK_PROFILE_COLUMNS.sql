-- Ver estructura de la tabla profiles
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name LIKE '%distance%'
ORDER BY ordinal_position;

-- Ver el perfil del usuario test@test.com
SELECT 
  id,
  full_name,
  email,
  distance_m,
  current_distance,
  group_type,
  has_own_bow
FROM profiles
WHERE email = 'test@test.com';
