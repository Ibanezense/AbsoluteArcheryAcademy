-- ============================================================================
-- MIGRACIÓN COMPLETA: Añadir amount_paid a membresías
-- Fecha: 2025-11-04
-- Descripción: Script consolidado para añadir y configurar el campo amount_paid
--              Ejecutar este archivo completo en Supabase SQL Editor
-- ============================================================================

-- PASO 1: Añadir columna amount_paid a profile_memberships
-- ============================================================================
ALTER TABLE public.profile_memberships 
ADD COLUMN IF NOT EXISTS amount_paid INTEGER NOT NULL DEFAULT 0 
CHECK (amount_paid >= 0);

COMMENT ON COLUMN public.profile_memberships.amount_paid IS 
  'Monto pagado en soles (PEN) por esta membresía';

-- PASO 2: Actualizar función admin_add_membership
-- ============================================================================

-- Eliminar versiones anteriores
DROP FUNCTION IF EXISTS admin_add_membership(uuid,uuid,text,integer,date,date,boolean);
DROP FUNCTION IF EXISTS admin_add_membership(uuid,uuid,text,integer,date,date,boolean,integer);

-- Crear función actualizada con amount_paid
CREATE OR REPLACE FUNCTION admin_add_membership(
  p_profile uuid,
  p_membership uuid,
  p_name text,
  p_classes integer,
  p_start date,
  p_end date,
  p_make_active boolean,
  p_amount_paid integer DEFAULT 0
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

  -- Validar que amount_paid sea >= 0
  IF p_amount_paid < 0 THEN
    RAISE EXCEPTION 'El monto pagado debe ser mayor o igual a 0';
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
    status,
    amount_paid
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
    END,
    p_amount_paid
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

COMMENT ON FUNCTION admin_add_membership IS 
  'Función RPC para que administradores agreguen membresías a perfiles de usuarios. Incluye el registro del monto pagado en soles.';

-- PASO 3: Actualizar función admin_update_profile_membership
-- ============================================================================

-- Eliminar versiones anteriores
DROP FUNCTION IF EXISTS admin_update_profile_membership(uuid,text,integer,date,date,text);
DROP FUNCTION IF EXISTS admin_update_profile_membership(uuid,text,integer,date,date,text,integer);

-- Crear función actualizada con amount_paid
CREATE OR REPLACE FUNCTION admin_update_profile_membership(
  p_id uuid,
  p_name text,
  p_classes integer,
  p_start date,
  p_end date,
  p_status text,
  p_amount_paid integer DEFAULT 0
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

  -- Validar que amount_paid sea >= 0
  IF p_amount_paid < 0 THEN
    RAISE EXCEPTION 'El monto pagado debe ser mayor o igual a 0';
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
    status = p_status::text,
    amount_paid = p_amount_paid
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

COMMENT ON FUNCTION admin_update_profile_membership IS 
  'Función RPC para que administradores actualicen membresías existentes. Incluye la actualización del monto pagado en soles.';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Verificar que la columna se añadió:
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'profile_memberships' AND column_name = 'amount_paid';

-- Verificar que las funciones se crearon:
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name IN ('admin_add_membership', 'admin_update_profile_membership')
ORDER BY routine_name;

-- ============================================================================
-- INSTRUCCIONES
-- ============================================================================
-- 1. Abre Supabase SQL Editor
-- 2. Copia y pega este archivo COMPLETO
-- 3. Ejecuta todo el script (botón RUN o Ctrl+Enter)
-- 4. Verifica que no hay errores
-- 5. Refresca tu aplicación web
-- ============================================================================
