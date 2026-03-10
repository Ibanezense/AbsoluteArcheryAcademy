-- ============================================================================
-- ADMIN MEMBERSHIP EDIT RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Permitir editar membresias V2 desde admin
-- 2. Permitir eliminar membresias sin historial de reservas asociado
-- 3. Mantener consistencia de una sola membresia activa por alumno
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_update_student_membership(
  uuid,
  text,
  date,
  date,
  text,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
);
CREATE OR REPLACE FUNCTION public.admin_update_student_membership(
  p_membership_id uuid,
  p_custom_name text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_classes_total integer DEFAULT NULL,
  p_classes_used integer DEFAULT NULL,
  p_classes_remaining integer DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.student_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_membership public.student_memberships;
  v_new_status text;
  v_new_total integer;
  v_new_used integer;
  v_new_remaining integer;
  v_new_amount numeric;
  v_updated public.student_memberships;
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

  v_new_status := COALESCE(NULLIF(btrim(p_status), ''), v_membership.status);
  v_new_total := COALESCE(p_classes_total, v_membership.classes_total);
  v_new_used := COALESCE(p_classes_used, v_membership.classes_used);
  v_new_remaining := COALESCE(p_classes_remaining, v_membership.classes_remaining);
  v_new_amount := COALESCE(p_total_amount, v_membership.total_amount);

  IF v_new_status NOT IN ('draft', 'active', 'expired', 'cancelled', 'consumed', 'historical') THEN
    RAISE EXCEPTION 'Estado de membresia invalido';
  END IF;

  IF v_new_total < 0 OR v_new_used < 0 OR v_new_remaining < 0 THEN
    RAISE EXCEPTION 'Las clases no pueden ser negativas';
  END IF;

  IF v_new_used > v_new_total THEN
    RAISE EXCEPTION 'Las clases usadas no pueden superar el total';
  END IF;

  IF v_new_amount < 0 THEN
    RAISE EXCEPTION 'El monto total no puede ser negativo';
  END IF;

  IF v_new_status IN ('expired', 'cancelled', 'consumed', 'historical') THEN
    v_new_remaining := 0;
  END IF;

  IF v_new_status = 'active' THEN
    UPDATE public.student_memberships
    SET
      status = 'historical',
      updated_at = now()
    WHERE student_id = v_membership.student_id
      AND id <> v_membership.id
      AND status = 'active';
  END IF;

  UPDATE public.student_memberships
  SET
    custom_name = COALESCE(NULLIF(btrim(p_custom_name), ''), custom_name),
    start_date = COALESCE(p_start_date, start_date),
    end_date = p_end_date,
    status = v_new_status,
    classes_total = v_new_total,
    classes_used = v_new_used,
    classes_remaining = v_new_remaining,
    total_amount = v_new_amount,
    currency = COALESCE(NULLIF(btrim(p_currency), ''), currency),
    notes = p_notes,
    updated_at = now()
  WHERE id = p_membership_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_student_membership(
  uuid,
  text,
  date,
  date,
  text,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
) TO authenticated;

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
  v_booking_count integer;
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

  SELECT COUNT(*)
  INTO v_booking_count
  FROM public.bookings
  WHERE active_membership_id = p_membership_id;

  IF v_booking_count > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar una membresia con reservas asociadas';
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
    'message', 'Membresia eliminada correctamente'
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

COMMENT ON FUNCTION public.admin_update_student_membership(
  uuid,
  text,
  date,
  date,
  text,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
) IS
  'Permite editar una membresia V2 desde admin y mantiene una sola membresia activa por alumno.';

COMMENT ON FUNCTION public.admin_delete_student_membership(uuid) IS
  'Elimina una membresia V2 solo si no tiene reservas asociadas. Borra tambien pagos y ledger derivados.';
