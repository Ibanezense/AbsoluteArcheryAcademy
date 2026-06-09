-- ============================================================================
-- Restrict admin membership deletion to expired or closed cycles
-- Purpose:
--   Allow admins to purge old expired memberships without risking the current
--   active cycle. Bookings are preserved through active_membership_id ON DELETE
--   SET NULL.
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
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_is_deletable boolean := false;
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

  v_is_deletable :=
    v_membership.status IN ('expired', 'historical', 'cancelled', 'consumed')
    OR (
      v_membership.status = 'active'
      AND v_membership.end_date IS NOT NULL
      AND v_membership.end_date < v_today
    );

  IF NOT v_is_deletable THEN
    RAISE EXCEPTION 'Solo se puede eliminar una membresia vencida, historica, cancelada o consumida';
  END IF;

  DELETE FROM public.student_membership_payments
  WHERE student_membership_id = p_membership_id;

  DELETE FROM public.student_credit_ledger
  WHERE student_membership_id = p_membership_id;

  DELETE FROM public.student_memberships
  WHERE id = p_membership_id;

  RETURN json_build_object(
    'success', true,
    'membership_id', p_membership_id,
    'message', 'Membresia vencida eliminada correctamente'
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
  'Elimina solo membresias vencidas o cerradas. Bloquea ciclos activos vigentes para proteger la membresia actual.';
