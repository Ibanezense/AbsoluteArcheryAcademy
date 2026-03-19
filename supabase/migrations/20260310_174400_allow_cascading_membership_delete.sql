-- ============================================================================
-- Update: admin_delete_student_membership
-- Purpose: Allow deleting a membership along with all its associated bookings
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_delete_student_membership(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_student_membership(
  p_membership_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_membership public.student_memberships;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'Membresia no encontrada';
  END IF;

  -- 1. Eliminar reservas asociadas a esta membresia
  DELETE FROM public.bookings
  WHERE active_membership_id = p_membership_id;

  -- 2. Eliminar pagos de la membresia
  DELETE FROM public.student_membership_payments
  WHERE student_membership_id = p_membership_id;

  -- 3. Eliminar historial de creditos y movimientos de la membresia
  DELETE FROM public.student_credit_ledger
  WHERE student_membership_id = p_membership_id;

  -- 4. Eliminar la membresia
  DELETE FROM public.student_memberships
  WHERE id = p_membership_id;

  RETURN json_build_object(
    'success', true,
    'membership_id', p_membership_id,
    'message', 'Membresia y sus reservas eliminadas correctamente'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'membership_id', p_membership_id,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_student_membership(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_student_membership(uuid) IS
  'Elimina una membresia V2 y TODAS sus reservas asociadas en cascada. Borra tambien pagos y ledger derivados.';
