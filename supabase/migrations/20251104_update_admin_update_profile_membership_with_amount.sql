-- ============================================================================
-- Migración: Actualizar función admin_update_profile_membership con amount_paid
-- Fecha: 2025-11-04
-- Descripción: Modifica la función RPC para aceptar y actualizar el monto pagado
--              al editar una membresía existente
-- ============================================================================

-- Eliminar versión anterior de la función
DROP FUNCTION IF EXISTS admin_update_profile_membership(uuid,text,integer,date,date,text);

-- Crear función actualizada con parámetro amount_paid
CREATE OR REPLACE FUNCTION admin_update_profile_membership(
  p_id uuid,
  p_name text,
  p_classes integer,
  p_start date,
  p_end date,
  p_status text,
  p_amount_paid integer DEFAULT 0  -- ✅ NUEVO: Monto pagado en soles
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
    amount_paid = p_amount_paid  -- ✅ NUEVO: Actualizar monto pagado
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

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION admin_update_profile_membership TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION admin_update_profile_membership IS 
  'Función RPC para que administradores actualicen membresías existentes. 
   Incluye la actualización del monto pagado en soles.';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Verificar que la función se actualizó correctamente:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_name = 'admin_update_profile_membership';

-- Ver la firma completa de la función:
-- \df admin_update_profile_membership
