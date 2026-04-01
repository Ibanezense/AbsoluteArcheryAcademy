-- ============================================================================
-- Fix: accumulate credits when renewing an active membership
-- Fecha: 2026-04-01
-- Proposito:
-- 1. Reutilizar la membresia activa del alumno al renovar
-- 2. Acumular clases nuevas sobre el saldo pendiente
-- 3. Registrar la renovacion en ledger y pagos sobre la misma membresia
-- ============================================================================

ALTER TABLE public.student_credit_ledger
  DROP CONSTRAINT IF EXISTS student_credit_ledger_movement_type_check;

ALTER TABLE public.student_credit_ledger
  ADD CONSTRAINT student_credit_ledger_movement_type_check
  CHECK (
    movement_type IN (
      'membership_activation',
      'membership_renewal',
      'booking_reserved',
      'booking_cancelled_refund',
      'booking_cancelled_no_refund',
      'admin_adjustment',
      'reward_credit',
      'migration_seed',
      'migration_usage'
    )
  );

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
  v_active_membership public.student_memberships;
  v_membership_id uuid;
  v_start_date date;
  v_end_date date;
  v_total_amount numeric;
  v_payment_amount numeric;
  v_balance_after integer;
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

  SELECT *
  INTO v_active_membership
  FROM public.student_memberships
  WHERE student_id = p_student_id
    AND status = 'active'
  ORDER BY start_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_active_membership IS NOT NULL THEN
    UPDATE public.student_memberships
    SET
      membership_plan_id = v_plan.id,
      custom_name = v_plan.name,
      classes_total = v_active_membership.classes_total + v_plan.classes_included,
      classes_remaining = v_active_membership.classes_remaining + v_plan.classes_included,
      start_date = LEAST(v_active_membership.start_date, v_start_date),
      end_date = CASE
        WHEN v_active_membership.end_date IS NULL OR v_end_date IS NULL THEN NULL
        ELSE GREATEST(v_active_membership.end_date, v_end_date)
      END,
      total_amount = COALESCE(v_active_membership.total_amount, 0) + v_total_amount,
      currency = COALESCE(v_plan.currency, v_active_membership.currency, 'PEN'),
      notes = CASE
        WHEN NULLIF(btrim(p_notes), '') IS NULL THEN v_active_membership.notes
        ELSE concat_ws(' | ', NULLIF(btrim(v_active_membership.notes), ''), NULLIF(btrim(p_notes), ''))
      END,
      sold_by_profile_id = v_actor_id,
      updated_at = now()
    WHERE id = v_active_membership.id
    RETURNING id, classes_remaining INTO v_membership_id, v_balance_after;

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
      'membership_renewal',
      v_plan.classes_included,
      v_balance_after,
      format('Renovacion de plan %s', v_plan.name),
      v_actor_id,
      now()
    );
  ELSE
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
    RETURNING id, classes_remaining INTO v_membership_id, v_balance_after;

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
      v_balance_after,
      format('Activacion de plan %s', v_plan.name),
      v_actor_id,
      now()
    );
  END IF;

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
      CASE
        WHEN v_active_membership IS NOT NULL THEN 'Pago registrado al renovar la membresia'
        ELSE 'Pago inicial registrado al vender la membresia'
      END,
      CASE
        WHEN v_active_membership IS NOT NULL THEN 'admin_renewal'
        ELSE 'admin_assignment'
      END,
      v_actor_id,
      now()
    );
  END IF;

  RETURN v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) IS
  'Vende o renueva una membresia V2 para un alumno. Si ya existe una activa, acumula nuevas clases sobre la misma membresia y registra ledger/pago en ese mismo registro.';
