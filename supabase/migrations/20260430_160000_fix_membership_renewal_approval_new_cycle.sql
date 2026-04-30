-- ============================================================================
-- Fix: membership renewal approval creates a new membership cycle
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Evitar que la aprobacion de renovacion acumule clases en la membresia vieja.
-- 2. Mover la membresia activa anterior a historical.
-- 3. Crear una nueva membresia activa limpia para que el alumno vea el nuevo plan.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_approve_membership_renewal_request(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_approve_membership_renewal_request(
  p_request_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_request public.student_membership_renewal_requests;
  v_plan public.membership_plans;
  v_membership_id uuid;
  v_start_date date;
  v_end_date date;
  v_notes text;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_request
  FROM public.student_membership_renewal_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_request.status NOT IN ('pending_payment', 'pending_validation') THEN
    RAISE EXCEPTION 'La solicitud ya fue procesada';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.membership_plans
  WHERE id = v_request.membership_plan_id
  FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan de membresia no encontrado';
  END IF;

  v_start_date := current_date;
  v_end_date := CASE
    WHEN v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN NULL
    ELSE v_start_date + (v_plan.duration_days - 1)
  END;
  v_notes := COALESCE(NULLIF(btrim(p_notes), ''), 'Renovacion solicitada desde la app');

  UPDATE public.student_memberships
  SET
    status = 'historical',
    updated_at = now()
  WHERE student_id = v_request.student_id
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
    v_request.student_id,
    v_request.membership_plan_id,
    COALESCE(v_plan.name, format('%s clases', v_request.classes_included)),
    v_request.classes_included,
    0,
    v_request.classes_included,
    v_start_date,
    v_end_date,
    'active',
    v_request.requested_price,
    COALESCE(v_request.currency, v_plan.currency, 'PEN'),
    v_notes,
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
    v_request.student_id,
    v_membership_id,
    'membership_activation',
    v_request.classes_included,
    v_request.classes_included,
    format('Renovacion de plan %s', COALESCE(v_plan.name, format('%s clases', v_request.classes_included))),
    v_actor_id,
    now()
  );

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
    v_request.student_id,
    v_membership_id,
    v_start_date,
    now(),
    v_request.requested_price,
    COALESCE(v_request.currency, v_plan.currency, 'PEN'),
    'admin_manual',
    CASE
      WHEN v_request.requested_price > 0 THEN 'paid'
      ELSE 'waived'
    END,
    0,
    NULL,
    'Pago registrado al aprobar renovacion solicitada desde la app',
    'admin_renewal',
    v_actor_id,
    now()
  );

  UPDATE public.student_membership_renewal_requests
  SET
    status = 'approved',
    student_membership_id = v_membership_id,
    approved_by_profile_id = v_actor_id,
    approved_at = now(),
    admin_notes = NULLIF(btrim(p_notes), ''),
    updated_at = now()
  WHERE id = p_request_id;

  UPDATE public.admin_alert_queue
  SET
    status = 'sent',
    sent_at = now(),
    updated_at = now()
  WHERE alert_type = 'membership_renewal_request'
    AND payload->>'request_id' = p_request_id::text;

  RETURN v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_membership_renewal_request(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_approve_membership_renewal_request(uuid, text) IS
  'Aprueba una solicitud de renovacion creando una nueva membresia activa y moviendo cualquier membresia activa anterior a historico.';
