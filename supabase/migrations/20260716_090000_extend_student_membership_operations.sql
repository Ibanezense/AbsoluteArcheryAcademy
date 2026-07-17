-- Datos operativos para gestionar membresías desde la ficha del alumno.
-- Migración aditiva e idempotente.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.student_membership_document_seq START 1;

CREATE OR REPLACE FUNCTION public.next_student_membership_document_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'MEM-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.student_membership_document_seq')::text, 6, '0');
$$;

REVOKE ALL ON FUNCTION public.next_student_membership_document_number() FROM PUBLIC;

ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS billing_date date,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_until date;

ALTER TABLE public.student_memberships
  ALTER COLUMN document_number SET DEFAULT public.next_student_membership_document_number();

UPDATE public.student_memberships
SET document_number = public.next_student_membership_document_number()
WHERE document_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_memberships_document_number
  ON public.student_memberships(document_number)
  WHERE document_number IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_memberships_payment_type_check'
      AND conrelid = 'public.student_memberships'::regclass
  ) THEN
    ALTER TABLE public.student_memberships
      ADD CONSTRAINT student_memberships_payment_type_check
      CHECK (payment_type IN ('manual', 'cash', 'card', 'transfer', 'yape', 'plin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_memberships_discount_type_check'
      AND conrelid = 'public.student_memberships'::regclass
  ) THEN
    ALTER TABLE public.student_memberships
      ADD CONSTRAINT student_memberships_discount_type_check
      CHECK (discount_type IN ('none', 'amount', 'percentage'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_memberships_discount_value_check'
      AND conrelid = 'public.student_memberships'::regclass
  ) THEN
    ALTER TABLE public.student_memberships
      ADD CONSTRAINT student_memberships_discount_value_check
      CHECK (discount_value >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_membership_from_profile(
  p_student_id uuid,
  p_membership_plan_id uuid,
  p_start_date date DEFAULT current_date,
  p_total_amount numeric DEFAULT NULL,
  p_payment_amount numeric DEFAULT NULL,
  p_payment_type text DEFAULT 'manual',
  p_discount_type text DEFAULT 'none',
  p_discount_value numeric DEFAULT 0,
  p_billing_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF COALESCE(p_payment_type, 'manual') NOT IN ('manual', 'cash', 'card', 'transfer', 'yape', 'plin') THEN
    RAISE EXCEPTION 'Tipo de pago inválido';
  END IF;

  IF COALESCE(p_discount_type, 'none') NOT IN ('none', 'amount', 'percentage') THEN
    RAISE EXCEPTION 'Tipo de descuento inválido';
  END IF;

  v_membership_id := public.admin_assign_membership_plan(
    p_student_id,
    p_membership_plan_id,
    p_start_date,
    p_total_amount,
    p_payment_amount,
    p_notes
  );

  UPDATE public.student_memberships
  SET payment_type = COALESCE(p_payment_type, 'manual'),
      billing_date = COALESCE(p_billing_date, p_start_date, current_date),
      discount_type = COALESCE(p_discount_type, 'none'),
      discount_value = GREATEST(COALESCE(p_discount_value, 0), 0),
      updated_at = now()
  WHERE id = v_membership_id;

  UPDATE public.student_membership_payments
  SET payment_method = COALESCE(p_payment_type, 'manual')
  WHERE student_membership_id = v_membership_id;

  RETURN v_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_membership_from_profile(
  uuid, uuid, date, numeric, numeric, text, text, numeric, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_membership_from_profile(
  uuid, uuid, date, numeric, numeric, text, text, numeric, date, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_membership_from_profile(
  uuid, uuid, date, numeric, numeric, text, text, numeric, date, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_manage_student_membership(
  p_membership_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.student_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.student_memberships;
  v_plan public.membership_plans;
  v_payment_type text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_membership
  FROM public.student_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'Membresía no encontrada';
  END IF;

  CASE p_action
    WHEN 'cancel' THEN
      UPDATE public.student_memberships
      SET status = 'cancelled', expired_at = COALESCE(expired_at, now()), updated_at = now()
      WHERE id = p_membership_id;

    WHEN 'dates' THEN
      UPDATE public.student_memberships
      SET start_date = COALESCE(NULLIF(p_payload->>'start_date', '')::date, start_date),
          end_date = CASE WHEN p_payload ? 'end_date' THEN NULLIF(p_payload->>'end_date', '')::date ELSE end_date END,
          billing_date = CASE WHEN p_payload ? 'billing_date' THEN NULLIF(p_payload->>'billing_date', '')::date ELSE billing_date END,
          updated_at = now()
      WHERE id = p_membership_id;

    WHEN 'plan' THEN
      SELECT * INTO v_plan FROM public.membership_plans WHERE id = (p_payload->>'membership_plan_id')::uuid;
      IF v_plan IS NULL THEN RAISE EXCEPTION 'Plan no encontrado'; END IF;
      UPDATE public.student_memberships
      SET membership_plan_id = v_plan.id,
          custom_name = v_plan.name,
          classes_total = v_plan.classes_included,
          classes_remaining = GREATEST(v_plan.classes_included - classes_used, 0),
          total_amount = COALESCE(v_plan.base_price, total_amount),
          currency = COALESCE(v_plan.currency, currency),
          updated_at = now()
      WHERE id = p_membership_id;

    WHEN 'payment_type' THEN
      v_payment_type := p_payload->>'payment_type';
      IF v_payment_type NOT IN ('manual', 'cash', 'card', 'transfer', 'yape', 'plin') THEN
        RAISE EXCEPTION 'Tipo de pago inválido';
      END IF;
      UPDATE public.student_memberships SET payment_type = v_payment_type, updated_at = now() WHERE id = p_membership_id;
      UPDATE public.student_membership_payments SET payment_method = v_payment_type WHERE student_membership_id = p_membership_id;

    WHEN 'billing_date' THEN
      UPDATE public.student_memberships
      SET billing_date = NULLIF(p_payload->>'billing_date', '')::date, updated_at = now()
      WHERE id = p_membership_id;

    WHEN 'discount' THEN
      IF COALESCE(p_payload->>'discount_type', 'none') NOT IN ('none', 'amount', 'percentage') THEN
        RAISE EXCEPTION 'Tipo de descuento inválido';
      END IF;
      UPDATE public.student_memberships
      SET discount_type = COALESCE(p_payload->>'discount_type', 'none'),
          discount_value = GREATEST(COALESCE(NULLIF(p_payload->>'discount_value', '')::numeric, 0), 0),
          updated_at = now()
      WHERE id = p_membership_id;

    WHEN 'freeze' THEN
      UPDATE public.student_memberships
      SET frozen_at = COALESCE(frozen_at, now()),
          frozen_until = NULLIF(p_payload->>'frozen_until', '')::date,
          updated_at = now()
      WHERE id = p_membership_id;

    WHEN 'unfreeze' THEN
      UPDATE public.student_memberships
      SET frozen_at = NULL, frozen_until = NULL, updated_at = now()
      WHERE id = p_membership_id;

    ELSE
      RAISE EXCEPTION 'Acción de membresía no soportada';
  END CASE;

  SELECT * INTO v_membership FROM public.student_memberships WHERE id = p_membership_id;
  RETURN v_membership;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_student_membership(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_manage_student_membership(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_student_membership(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_booking_with_frozen_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'reserved' AND NEW.active_membership_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_memberships
    WHERE id = NEW.active_membership_id
      AND frozen_at IS NOT NULL
      AND (frozen_until IS NULL OR frozen_until >= current_date)
  ) THEN
    RAISE EXCEPTION 'La membresía está congelada y no admite nuevas reservas';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_booking_with_frozen_membership() FROM PUBLIC;

DROP TRIGGER IF EXISTS bookings_prevent_frozen_membership ON public.bookings;
CREATE TRIGGER bookings_prevent_frozen_membership
  BEFORE INSERT OR UPDATE OF status, active_membership_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_with_frozen_membership();

COMMIT;
