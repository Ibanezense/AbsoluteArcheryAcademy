-- ============================================================================
-- Migración: Actualizar función admin_add_membership para incluir amount_paid
-- Fecha: 2025-11-04
-- Descripción: Modifica la función RPC para aceptar y guardar el monto pagado
--              al crear una nueva membresía para un alumno
-- ============================================================================

-- IMPORTANTE: Primero debes ejecutar la migración que añade la columna amount_paid:
-- 20251104_add_amount_paid_to_profile_memberships.sql

-- Eliminar versión anterior de la función
DROP FUNCTION IF EXISTS admin_add_membership(uuid,uuid,text,integer,date,date,boolean);

-- Crear función actualizada con parámetro amount_paid
CREATE OR REPLACE FUNCTION admin_add_membership(
  p_profile uuid,
  p_membership uuid,
  p_name text,
  p_classes integer,
  p_start date,
  p_end date,
  p_make_active boolean,
  p_amount_paid integer DEFAULT 0  -- ✅ NUEVO: Monto pagado en soles
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
    amount_paid  -- ✅ NUEVO: Guardar monto pagado
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
    p_amount_paid  -- ✅ NUEVO: Valor del parámetro
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

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION admin_add_membership TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION admin_add_membership IS 
  'Función RPC para que administradores agreguen membresías a perfiles de usuarios. 
   Incluye el registro del monto pagado en soles.';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_name = 'admin_add_membership';

-- Ver la firma completa de la función:
-- \df admin_add_membership
