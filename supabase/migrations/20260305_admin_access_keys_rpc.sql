-- ============================================================================
-- ADMIN ACCESS KEYS MANAGEMENT RPCs (FIX)
-- Fecha: 2026-03-05
-- Fix: Eliminar acceso a auth.users que causa 400 en PostgREST
-- ============================================================================

-- Eliminar version anterior con tipo de retorno diferente
DROP FUNCTION IF EXISTS public.admin_list_access_keys();

-- 1. Listar todas las claves de acceso (sin acceder a auth.users)
CREATE OR REPLACE FUNCTION public.admin_list_access_keys()
RETURNS TABLE(
  profile_id uuid,
  full_name text,
  role text,
  access_code text,
  email text,
  is_active boolean,
  related_student_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.full_name::text,
    p.role::text,
    p.access_code::text,
    p.email::text,
    COALESCE(p.is_active, true) AS is_active,
    (
      SELECT string_agg(s.full_name, ', ')
      FROM public.student_guardians sg
      INNER JOIN public.students s ON s.id = sg.student_id
      WHERE sg.guardian_profile_id = p.id
    )::text AS related_student_name
  FROM public.profiles p
  WHERE p.role IN ('student', 'guardian', 'admin')
  ORDER BY
    CASE p.role
      WHEN 'admin' THEN 0
      WHEN 'guardian' THEN 1
      WHEN 'student' THEN 2
      ELSE 3
    END,
    p.full_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.admin_list_access_keys() IS
  'Lista todos los perfiles con su clave de acceso, rol y email. Solo admins.';

-- 2. Actualizar o asignar manualmente una clave de acceso
CREATE OR REPLACE FUNCTION public.admin_upsert_access_code(
  p_profile_id uuid,
  p_new_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores.';
  END IF;

  v_normalized := upper(btrim(p_new_code));

  IF v_normalized !~ '^[A-Z0-9]{6,8}$' THEN
    RAISE EXCEPTION 'El codigo debe tener entre 6 y 8 caracteres alfanumericos.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE access_code = v_normalized AND id != p_profile_id
  ) THEN
    RAISE EXCEPTION 'Este codigo ya esta asignado a otro perfil.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Perfil no encontrado.';
  END IF;

  UPDATE public.profiles
  SET access_code = v_normalized
  WHERE id = p_profile_id;
END;
$$;

COMMENT ON FUNCTION public.admin_upsert_access_code(uuid, text) IS
  'Asigna o edita la clave de acceso de un perfil. Valida formato y unicidad. Solo admins.';

-- 3. Auto-generar clave unica para un perfil
CREATE OR REPLACE FUNCTION public.admin_generate_access_code(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate text;
  v_attempts integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Perfil no encontrado.';
  END IF;

  LOOP
    v_candidate := public.generate_access_code(6);
    v_attempts := v_attempts + 1;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE access_code = v_candidate
    );

    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'No se pudo generar un codigo unico despues de 20 intentos.';
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET access_code = v_candidate
  WHERE id = p_profile_id;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.admin_generate_access_code(uuid) IS
  'Genera automaticamente un codigo de acceso unico de 6 caracteres y lo asigna al perfil indicado. Solo admins.';
