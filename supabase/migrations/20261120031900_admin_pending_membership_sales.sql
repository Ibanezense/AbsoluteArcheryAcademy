BEGIN;

-- A pending charge has a due amount and no collection date.
ALTER TABLE public.student_membership_payments ALTER COLUMN paid_at DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.student_membership_payments'::regclass
    AND conname = 'membership_paid_requires_collection_date') THEN
    ALTER TABLE public.student_membership_payments ADD CONSTRAINT membership_paid_requires_collection_date
      CHECK (payment_status <> 'paid' OR paid_at IS NOT NULL);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_create_pending_membership_cycles(
  p_student_id uuid, p_membership_plan_id uuid, p_start_date date, p_period_count integer,
  p_origin text, p_gift_classes integer, p_gift_end_date date, p_total_amount numeric,
  p_payment_amount numeric, p_payment_type text, p_discount_type text, p_discount_value numeric,
  p_notes text, p_billing_date date, p_idempotency_key uuid, p_fixed_template_ids uuid[],
  p_recovery_classes integer, p_recovery_reason text, p_source_membership_id uuid
)
RETURNS SETOF public.student_memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_existing boolean; v_expected integer; v_updated integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden registrar membresías pendientes';
  END IF;
  IF p_idempotency_key IS NULL OR p_origin IS DISTINCT FROM 'paid' OR p_total_amount IS NULL
     OR p_total_amount <= 0 OR p_payment_amount IS DISTINCT FROM 0 OR p_payment_type IS NOT NULL THEN
    RAISE EXCEPTION 'La venta pendiente requiere un importe mayor que cero y ningún cobro recibido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  SELECT EXISTS (SELECT 1 FROM public.student_memberships WHERE assignment_batch_id = p_idempotency_key)
    INTO v_existing;
  IF v_existing THEN
    IF EXISTS (SELECT 1 FROM public.student_memberships WHERE assignment_batch_id = p_idempotency_key AND student_id <> p_student_id) THEN
      RAISE EXCEPTION 'La clave idempotente ya pertenece a otro alumno';
    END IF;
    RETURN QUERY SELECT sm.* FROM public.student_memberships sm
      WHERE sm.assignment_batch_id = p_idempotency_key ORDER BY sm.start_date, sm.id;
    RETURN;
  END IF;
  PERFORM public.admin_create_student_membership_cycles(
    p_student_id, p_membership_plan_id, p_start_date, p_period_count,
    p_origin, p_gift_classes, p_gift_end_date, p_total_amount,
    0, NULL, p_discount_type, p_discount_value, p_notes, p_billing_date, p_idempotency_key,
    p_fixed_template_ids, p_recovery_classes, p_recovery_reason, p_source_membership_id
  );

  SELECT count(*) INTO v_expected FROM public.student_memberships
    WHERE assignment_batch_id = p_idempotency_key AND student_id = p_student_id;
  UPDATE public.student_membership_payments payment
    SET amount = membership.total_amount, paid_at = NULL,
        notes = 'Membresía activada con pago pendiente'
    FROM public.student_memberships membership
    WHERE payment.student_membership_id = membership.id
      AND membership.student_id = p_student_id AND membership.assignment_batch_id = p_idempotency_key
      AND payment.payment_status = 'pending' AND payment.amount = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_expected IS DISTINCT FROM p_period_count OR v_expected < 1 OR v_updated <> v_expected THEN
    RAISE EXCEPTION 'No se pudieron registrar los importes pendientes de todos los ciclos';
  END IF;

  RETURN QUERY SELECT sm.* FROM public.student_memberships sm
    WHERE sm.assignment_batch_id = p_idempotency_key ORDER BY sm.start_date, sm.id;
END
$$;

REVOKE ALL ON FUNCTION public.admin_create_pending_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, date, uuid, uuid[], integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_pending_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, date, uuid, uuid[], integer, text, uuid) TO authenticated, service_role;

COMMIT;
