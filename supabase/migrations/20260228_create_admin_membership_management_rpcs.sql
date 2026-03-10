-- ============================================================================
-- ADMIN MEMBERSHIP MANAGEMENT RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Permitir vender o renovar membresias V2 desde admin
-- 2. Cerrar membresias activas anteriores antes de activar una nueva
-- 3. Registrar ledger inicial y pago opcional
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.admin_assign_membership_plan(
  p_student_id uuid,
  p_membership_plan_id uuid,
  p_start_date date DEFAULT current_date,
  p_total_amount numeric DEFAULT NULL,
  p_payment_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_plan public.membership_plans;
  v_membership_id uuid;
  v_start_date date;
  v_end_date date;
  v_total_amount numeric;
  v_payment_amount numeric;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.membership_plans
  WHERE id = p_membership_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan de membresia no encontrado';
  END IF;

  IF COALESCE(v_plan.is_active, true) = false THEN
    RAISE EXCEPTION 'El plan seleccionado esta inactivo';
  END IF;

  v_start_date := COALESCE(p_start_date, current_date);
  v_total_amount := COALESCE(p_total_amount, v_plan.base_price, 0);
  v_payment_amount := COALESCE(p_payment_amount, NULL);

  IF v_total_amount < 0 THEN
    RAISE EXCEPTION 'El monto total no puede ser negativo';
  END IF;

  IF v_payment_amount IS NOT NULL AND v_payment_amount < 0 THEN
    RAISE EXCEPTION 'El pago no puede ser negativo';
  END IF;

  IF v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN
    v_end_date := NULL;
  ELSE
    v_end_date := v_start_date + (v_plan.duration_days - 1);
  END IF;

  UPDATE public.student_memberships
  SET
    status = 'historical',
    updated_at = now()
  WHERE student_id = p_student_id
    AND status = 'active';

  INSERT INTO public.student_memberships (
    student_id,
    membership_plan_id,
    custom_name,
    classes_total,
    classes_used,
    classes_remaining,
    start_date,
    end_date,
    status,
    total_amount,
    currency,
    notes,
    sold_by_profile_id,
    created_at,
    updated_at
  )
  VALUES (
    p_student_id,
    v_plan.id,
    v_plan.name,
    v_plan.classes_included,
    0,
    v_plan.classes_included,
    v_start_date,
    v_end_date,
    'active',
    v_total_amount,
    COALESCE(v_plan.currency, 'PEN'),
    NULLIF(btrim(p_notes), ''),
    v_actor_id,
    now(),
    now()
  )
  RETURNING id INTO v_membership_id;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership_id,
    'membership_activation',
    v_plan.classes_included,
    v_plan.classes_included,
    format('Activacion de plan %s', v_plan.name),
    v_actor_id,
    now()
  );

  IF v_payment_amount IS NOT NULL THEN
    INSERT INTO public.student_membership_payments (
      student_id,
      student_membership_id,
      due_date,
      paid_at,
      amount,
      currency,
      payment_method,
      payment_status,
      reward_credits,
      reward_reason,
      notes,
      source,
      recorded_by_profile_id,
      created_at
    )
    VALUES (
      p_student_id,
      v_membership_id,
      v_start_date,
      now(),
      v_payment_amount,
      COALESCE(v_plan.currency, 'PEN'),
      'admin_manual',
      CASE
        WHEN v_payment_amount > 0 THEN 'paid'
        ELSE 'waived'
      END,
      0,
      NULL,
      'Pago inicial registrado al vender la membresia',
      'admin_assignment',
      v_actor_id,
      now()
    );
  END IF;

  RETURN v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) IS
  'Vende o renueva una membresia V2 para un alumno, cierra cualquier membresia activa previa y registra ledger inicial y pago opcional.';
