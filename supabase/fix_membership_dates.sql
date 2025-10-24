-- ====================================================================
-- FIX: Problema de fechas que se restan/suman un día al guardar
-- ====================================================================
-- El problema ocurre cuando las funciones RPC tienen parámetros tipo TEXT
-- en lugar de DATE, causando conversiones incorrectas de zona horaria.
--
-- SOLUCIÓN: Redefinir las funciones con parámetros tipo DATE
-- ====================================================================

-- PASO 1: Eliminar funciones existentes
-- ====================================================================
DROP FUNCTION IF EXISTS admin_add_membership(uuid,uuid,text,integer,text,text,boolean);
DROP FUNCTION IF EXISTS admin_add_membership(uuid,uuid,text,integer,date,date,boolean);
DROP FUNCTION IF EXISTS admin_update_profile_membership(uuid,text,integer,text,text,text);
DROP FUNCTION IF EXISTS admin_update_profile_membership(uuid,text,integer,date,date,text);

-- PASO 2: Crear funciones con tipos correctos
-- ====================================================================

-- 1. Función para AGREGAR membresía a un perfil
-- ====================================================================
CREATE OR REPLACE FUNCTION admin_add_membership(
  p_profile uuid,
  p_membership uuid,
  p_name text,
  p_classes integer,
  p_start date,        -- ✅ CAMBIAR de text a date
  p_end date,          -- ✅ CAMBIAR de text a date  
  p_make_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_pm_id uuid;
BEGIN
  -- Verificar que es admin
  SELECT exists (
    SELECT 1 FROM profiles 
    WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Insertar en profile_memberships
  INSERT INTO profile_memberships (
    profile_id,
    membership_id,
    name,
    classes_total,
    classes_used,
    start_date,
    end_date,
    status
  ) VALUES (
    p_profile,
    p_membership,
    p_name,
    p_classes,
    0,
    p_start,
    p_end,
    CASE 
      WHEN p_make_active THEN 'active'
      ELSE 'historical'
    END
  )
  RETURNING id INTO v_pm_id;

  -- Si se marca como activa, actualizar el perfil principal
  IF p_make_active THEN
    -- Primero desactivar otras membresías
    UPDATE profile_memberships 
    SET status = 'historical'
    WHERE profile_id = p_profile 
      AND id != v_pm_id
      AND status = 'active';

    -- Actualizar perfil
    UPDATE profiles
    SET 
      membership_type = p_name,
      membership_start = p_start,
      membership_end = p_end,
      classes_remaining = p_classes
    WHERE id = p_profile;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_add_membership TO authenticated;


-- 2. Función para ACTUALIZAR membresía existente
-- ====================================================================
CREATE OR REPLACE FUNCTION admin_update_profile_membership(
  p_id uuid,
  p_name text,
  p_classes integer,
  p_start date,        -- ✅ CAMBIAR de text a date
  p_end date,          -- ✅ CAMBIAR de text a date
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_profile_id uuid;
BEGIN
  -- Verificar que es admin
  SELECT exists (
    SELECT 1 FROM profiles 
    WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Obtener el profile_id antes de actualizar
  SELECT profile_id INTO v_profile_id
  FROM profile_memberships
  WHERE id = p_id;

  -- Actualizar la membresía
  UPDATE profile_memberships
  SET 
    name = p_name,
    classes_total = p_classes,
    start_date = p_start,
    end_date = p_end,
    status = p_status::text
  WHERE id = p_id;

  -- Si se marcó como activa, actualizar perfil y desactivar otras
  IF p_status = 'active' THEN
    -- Desactivar otras membresías activas
    UPDATE profile_memberships 
    SET status = 'historical'
    WHERE profile_id = v_profile_id 
      AND id != p_id
      AND status = 'active';

    -- Actualizar perfil principal
    UPDATE profiles
    SET 
      membership_type = p_name,
      membership_start = p_start,
      membership_end = p_end,
      classes_remaining = p_classes
    WHERE id = v_profile_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_profile_membership TO authenticated;


-- 3. Función para ACTUALIZAR perfil con fechas correctas
-- ====================================================================
DROP FUNCTION IF EXISTS admin_update_profile_dates(uuid,text,date,date);

CREATE OR REPLACE FUNCTION admin_update_profile_dates(
  p_profile_id uuid,
  p_membership_type text,
  p_membership_start date,
  p_membership_end date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- Verificar que es admin
  SELECT exists (
    SELECT 1 FROM profiles 
    WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Actualizar solo las fechas del perfil
  UPDATE profiles
  SET 
    membership_type = p_membership_type,
    membership_start = p_membership_start,
    membership_end = p_membership_end,
    updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_profile_dates TO authenticated;


-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Abre el editor SQL de Supabase (SQL Editor)
-- 2. Copia y pega este archivo completo
-- 3. Ejecuta el script
-- 4. Las funciones ahora aceptarán fechas tipo DATE correctamente
-- 5. El problema de fechas que cambian de día debería estar resuelto
-- ====================================================================
