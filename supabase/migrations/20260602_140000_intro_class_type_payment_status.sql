-- ============================================================================
-- Intro class type and payment status
-- Date: 2026-06-02
-- ============================================================================
-- Supports paid, free and courtesy intro classes without conflating class type,
-- payment state and operational booking status.

ALTER TABLE public.intro_payments
  ADD COLUMN IF NOT EXISTS intro_class_type text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS courtesy_reason text,
  ADD COLUMN IF NOT EXISTS courtesy_authorized_by_profile_id uuid REFERENCES public.profiles(id);

UPDATE public.intro_payments
SET
  intro_class_type = CASE
    WHEN COALESCE(amount, 0) > 0 THEN 'paid'
    ELSE 'free'
  END,
  payment_status = CASE
    WHEN COALESCE(amount, 0) > 0 THEN 'paid'
    ELSE 'not_applicable'
  END
WHERE intro_class_type IS NULL
   OR payment_status IS NULL;

ALTER TABLE public.intro_payments
  ALTER COLUMN intro_class_type SET DEFAULT 'paid',
  ALTER COLUMN payment_status SET DEFAULT 'paid',
  ALTER COLUMN intro_class_type SET NOT NULL,
  ALTER COLUMN payment_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intro_payments_class_type_chk'
      AND conrelid = 'public.intro_payments'::regclass
  ) THEN
    ALTER TABLE public.intro_payments
      ADD CONSTRAINT intro_payments_class_type_chk
      CHECK (intro_class_type IN ('paid', 'free', 'courtesy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intro_payments_payment_status_chk'
      AND conrelid = 'public.intro_payments'::regclass
  ) THEN
    ALTER TABLE public.intro_payments
      ADD CONSTRAINT intro_payments_payment_status_chk
      CHECK (payment_status IN ('pending', 'paid', 'not_applicable'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intro_payments_type_payment_rule_chk'
      AND conrelid = 'public.intro_payments'::regclass
  ) THEN
    ALTER TABLE public.intro_payments
      ADD CONSTRAINT intro_payments_type_payment_rule_chk
      CHECK (
        (
          intro_class_type = 'paid'
          AND amount > 0
          AND payment_status IN ('pending', 'paid')
        )
        OR (
          intro_class_type = 'free'
          AND amount = 0
          AND payment_status = 'not_applicable'
        )
        OR (
          intro_class_type = 'courtesy'
          AND amount = 0
          AND payment_status = 'not_applicable'
          AND NULLIF(btrim(COALESCE(courtesy_reason, '')), '') IS NOT NULL
        )
      );
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_register_intro_class(text, integer, text, uuid, numeric, text);
DROP FUNCTION IF EXISTS public.admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_register_intro_class(
  p_full_name text,
  p_age integer,
  p_phone text,
  p_session_id uuid,
  p_amount_paid numeric,
  p_payment_method text,
  p_intro_class_type text DEFAULT 'paid',
  p_payment_status text DEFAULT NULL,
  p_courtesy_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions;
  v_capacity integer := 0;
  v_booked_count integer := 0;
  v_intro_client_id uuid;
  v_booking_id uuid;
  v_payment_id uuid;
  v_actor_id uuid;
  v_intro_class_type text;
  v_payment_status text;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_intro_class_type := COALESCE(NULLIF(btrim(p_intro_class_type), ''), 'paid');
  v_payment_status := COALESCE(
    NULLIF(btrim(p_payment_status), ''),
    CASE WHEN v_intro_class_type = 'paid' THEN 'paid' ELSE 'not_applicable' END
  );

  IF NULLIF(btrim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;

  IF p_age IS NULL OR p_age < 5 THEN
    RAISE EXCEPTION 'La edad del cliente no es valida';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'El turno es obligatorio';
  END IF;

  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'El monto cobrado no es valido';
  END IF;

  IF v_intro_class_type NOT IN ('paid', 'free', 'courtesy') THEN
    RAISE EXCEPTION 'Tipo de clase intro no valido';
  END IF;

  IF v_payment_status NOT IN ('pending', 'paid', 'not_applicable') THEN
    RAISE EXCEPTION 'Estado de pago no valido';
  END IF;

  IF v_intro_class_type = 'paid'
    AND (p_amount_paid <= 0 OR v_payment_status NOT IN ('pending', 'paid'))
  THEN
    RAISE EXCEPTION 'Una clase intro pagada requiere monto mayor a cero y estado pendiente o pagado';
  END IF;

  IF v_intro_class_type IN ('free', 'courtesy')
    AND (p_amount_paid <> 0 OR v_payment_status <> 'not_applicable')
  THEN
    RAISE EXCEPTION 'Una clase intro gratuita o de cortesia requiere monto cero y pago no aplica';
  END IF;

  IF v_intro_class_type = 'courtesy'
    AND NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'El motivo de cortesia es obligatorio';
  END IF;

  IF NULLIF(btrim(p_payment_method), '') IS NULL THEN
    RAISE EXCEPTION 'El metodo de pago es obligatorio';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Turno no encontrado';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Solo se pueden agendar clases de prueba en turnos programados';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No se puede agendar una clase de prueba en un turno pasado';
  END IF;

  SELECT COALESCE(
    MAX(
      CASE
        WHEN COALESCE(sda.slot_capacity, 0) > 0 THEN sda.slot_capacity
        WHEN COALESCE(sda.targets, 0) > 0 THEN sda.targets * 4
        ELSE 0
      END
    ),
    0
  )
  INTO v_capacity
  FROM public.session_distance_allocations sda
  WHERE sda.session_id = p_session_id
    AND sda.distance_m = 10;

  IF v_capacity <= 0 THEN
    RAISE EXCEPTION 'El turno no tiene cupos configurados para 10 m';
  END IF;

  SELECT COUNT(*)
  INTO v_booked_count
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.distance_m = 10
    AND b.status IN ('reserved', 'attended', 'no_show');

  IF v_booked_count >= v_capacity THEN
    RAISE EXCEPTION 'No hay cupos disponibles para este turno';
  END IF;

  INSERT INTO public.intro_clients (
    full_name,
    age,
    phone
  )
  VALUES (
    btrim(p_full_name),
    p_age,
    NULLIF(btrim(p_phone), '')
  )
  RETURNING id INTO v_intro_client_id;

  INSERT INTO public.bookings (
    session_id,
    intro_client_id,
    status,
    distance_m,
    bow_usage_type
  )
  VALUES (
    p_session_id,
    v_intro_client_id,
    'reserved',
    10,
    'shared_inventory'
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.intro_payments (
    intro_client_id,
    amount,
    payment_method,
    intro_class_type,
    payment_status,
    courtesy_reason,
    courtesy_authorized_by_profile_id
  )
  VALUES (
    v_intro_client_id,
    p_amount_paid,
    btrim(p_payment_method),
    v_intro_class_type,
    v_payment_status,
    NULLIF(btrim(COALESCE(p_courtesy_reason, '')), ''),
    CASE WHEN v_intro_class_type = 'courtesy' THEN v_actor_id ELSE NULL END
  )
  RETURNING id INTO v_payment_id;

  RETURN json_build_object(
    'success', true,
    'intro_client_id', v_intro_client_id,
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'intro_class_type', v_intro_class_type,
    'payment_status', v_payment_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text) IS
  'Atomically registers a paid, free or courtesy intro client with booking and payment metadata.';
