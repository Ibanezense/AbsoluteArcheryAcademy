-- Permite ciclos de membresia separados y seleccion FIFO por alumno.
-- Migracion aditiva e idempotente: no modifica membresias existentes.

BEGIN;

DROP INDEX IF EXISTS public.idx_student_memberships_one_active;

ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS membership_origin text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS assignment_batch_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_memberships_origin_check'
      AND conrelid = 'public.student_memberships'::regclass
  ) THEN
    ALTER TABLE public.student_memberships
      ADD CONSTRAINT student_memberships_origin_check
      CHECK (membership_origin IN ('paid', 'gift'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_student_memberships_fifo
  ON public.student_memberships(student_id, status, start_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_student_memberships_assignment_batch
  ON public.student_memberships(assignment_batch_id)
  WHERE assignment_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_reserved_membership_commitments
  ON public.bookings(active_membership_id)
  WHERE status = 'reserved'
    AND active_membership_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.select_student_membership_for_date(
  p_student_id uuid,
  p_service_date date
)
RETURNS public.student_memberships
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sm.*
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND sm.start_date <= p_service_date
    AND (sm.end_date IS NULL OR sm.end_date >= p_service_date)
    AND sm.classes_remaining > (
      SELECT COUNT(*)
      FROM public.bookings b
      WHERE b.active_membership_id = sm.id
        AND b.status = 'reserved'
    )
  ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.select_student_membership_for_date(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_student_membership_for_date(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.select_student_membership_for_date(uuid, date) TO authenticated, service_role;

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
  v_actor_id uuid := auth.uid();
  v_student public.students;
  v_plan public.membership_plans;
  v_membership_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_start_date date := COALESCE(p_start_date, current_date);
  v_end_date date;
  v_total_amount numeric;
  v_payment_amount numeric;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

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

  v_total_amount := COALESCE(p_total_amount, v_plan.base_price, 0);
  v_payment_amount := p_payment_amount;

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
    membership_origin,
    assignment_batch_id,
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
    'paid',
    v_batch_id,
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
      CASE WHEN v_payment_amount > 0 THEN 'paid' ELSE 'waived' END,
      0,
      NULL,
      'Pago inicial registrado al vender la membresia',
      'admin_assignment',
      v_actor_id,
      now()
    );
  END IF;

  PERFORM public.sync_student_membership_operational_status(p_student_id);

  RETURN v_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_create_student_membership_cycles(
  p_student_id uuid,
  p_membership_plan_id uuid DEFAULT NULL,
  p_start_date date DEFAULT current_date,
  p_period_count integer DEFAULT 1,
  p_origin text DEFAULT 'paid',
  p_gift_classes integer DEFAULT NULL,
  p_gift_end_date date DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL,
  p_payment_amount numeric DEFAULT NULL,
  p_payment_type text DEFAULT 'manual',
  p_discount_type text DEFAULT 'none',
  p_discount_value numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS SETOF public.student_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- Financial contract:
-- p_total_amount is the price of each cycle.
-- p_payment_amount is the payment for the whole batch and is distributed once.
DECLARE
  v_actor_id uuid := auth.uid();
  v_student public.students;
  v_plan public.membership_plans;
  v_batch_id uuid := COALESCE(p_idempotency_key, gen_random_uuid());
  v_origin text := lower(COALESCE(p_origin, 'paid'));
  v_period_count integer := COALESCE(p_period_count, 1);
  v_period integer;
  v_start_date date := COALESCE(p_start_date, current_date);
  v_end_date date;
  v_membership_id uuid;
  v_classes integer;
  v_name text;
  v_currency text := 'PEN';
  v_total_amount numeric;
  v_payment_amount numeric;
  v_batch_payment_amount numeric;
  v_distributed_payment numeric := 0;
  v_payment_status text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Serializa reintentos concurrentes de la misma operacion antes de consultar.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

    IF EXISTS (
      SELECT 1
      FROM public.student_memberships sm
      WHERE sm.assignment_batch_id = p_idempotency_key
        AND sm.student_id <> p_student_id
    ) THEN
      RAISE EXCEPTION 'La clave idempotente ya pertenece a otro alumno';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.student_memberships sm
      WHERE sm.assignment_batch_id = p_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT sm.*
      FROM public.student_memberships sm
      WHERE sm.assignment_batch_id = p_idempotency_key
      ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC;
      RETURN;
    END IF;
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF v_origin NOT IN ('paid', 'gift') THEN
    RAISE EXCEPTION 'Origen de membresia invalido';
  END IF;

  IF v_period_count NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'La cantidad de periodos debe estar entre 1 y 12';
  END IF;

  IF COALESCE(p_payment_type, 'manual') NOT IN ('manual', 'cash', 'card', 'transfer', 'yape', 'plin') THEN
    RAISE EXCEPTION 'Tipo de pago invalido';
  END IF;

  IF COALESCE(p_discount_type, 'none') NOT IN ('none', 'amount', 'percentage') THEN
    RAISE EXCEPTION 'Tipo de descuento invalido';
  END IF;

  IF COALESCE(p_discount_value, 0) < 0 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo';
  END IF;

  IF COALESCE(p_discount_type, 'none') = 'percentage'
    AND COALESCE(p_discount_value, 0) > 100
  THEN
    RAISE EXCEPTION 'El descuento porcentual no puede ser mayor que 100';
  END IF;

  IF p_total_amount IS NOT NULL AND p_total_amount < 0 THEN
    RAISE EXCEPTION 'El monto total no puede ser negativo';
  END IF;

  IF p_payment_amount IS NOT NULL AND p_payment_amount < 0 THEN
    RAISE EXCEPTION 'El pago no puede ser negativo';
  END IF;

  IF v_origin = 'paid' THEN
    IF p_membership_plan_id IS NULL THEN
      RAISE EXCEPTION 'Debe seleccionar un plan para una membresia pagada';
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

    IF v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN
      RAISE EXCEPTION 'El plan debe tener una duracion positiva';
    END IF;

    IF v_plan.classes_included IS NULL OR v_plan.classes_included <= 0 THEN
      RAISE EXCEPTION 'El plan debe incluir al menos una clase';
    END IF;

    v_classes := v_plan.classes_included;
    v_name := v_plan.name;
    v_currency := COALESCE(v_plan.currency, 'PEN');
    v_total_amount := COALESCE(p_total_amount, v_plan.base_price, 0);
    v_batch_payment_amount := COALESCE(
      p_payment_amount,
      v_total_amount * v_period_count
    );
  ELSE
    v_period_count := 1;

    IF p_gift_classes IS NULL OR p_gift_classes <= 0 THEN
      RAISE EXCEPTION 'El obsequio debe incluir al menos una clase';
    END IF;

    IF p_gift_end_date IS NULL OR p_gift_end_date < v_start_date THEN
      RAISE EXCEPTION 'La fecha final del obsequio debe ser igual o posterior a la inicial';
    END IF;

    v_classes := p_gift_classes;
    v_name := format(
      'Obsequio · %s clase%s',
      p_gift_classes,
      CASE WHEN p_gift_classes = 1 THEN '' ELSE 's' END
    );
    v_total_amount := 0;
    v_batch_payment_amount := 0;
    v_payment_amount := 0;
  END IF;

  IF v_total_amount < 0 OR v_batch_payment_amount < 0 THEN
    RAISE EXCEPTION 'Los importes no pueden ser negativos';
  END IF;

  FOR v_period IN 1..v_period_count LOOP
    IF v_origin = 'paid' THEN
      v_end_date := v_start_date + (v_plan.duration_days - 1);
    ELSE
      v_end_date := p_gift_end_date;
    END IF;

    v_payment_amount := CASE
      WHEN v_origin = 'gift' THEN 0
      WHEN v_period = v_period_count
        THEN v_batch_payment_amount - v_distributed_payment
      ELSE ROUND(v_batch_payment_amount / v_period_count, 2)
    END;

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
      payment_type,
      billing_date,
      discount_type,
      discount_value,
      membership_origin,
      assignment_batch_id,
      created_at,
      updated_at
    )
    VALUES (
      p_student_id,
      CASE WHEN v_origin = 'paid' THEN v_plan.id ELSE NULL END,
      v_name,
      v_classes,
      0,
      v_classes,
      v_start_date,
      v_end_date,
      'active',
      v_total_amount,
      v_currency,
      NULLIF(btrim(p_notes), ''),
      v_actor_id,
      COALESCE(p_payment_type, 'manual'),
      v_start_date,
      COALESCE(p_discount_type, 'none'),
      COALESCE(p_discount_value, 0),
      v_origin,
      v_batch_id,
      now(),
      now()
    )
    RETURNING id INTO v_membership_id;

    v_payment_status := CASE
      WHEN v_origin = 'gift' OR v_total_amount = 0 THEN 'waived'
      WHEN v_payment_amount >= v_total_amount THEN 'paid'
      ELSE 'pending'
    END;

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
      v_currency,
      COALESCE(p_payment_type, 'manual'),
      v_payment_status,
      0,
      NULL,
      CASE
        WHEN v_origin = 'gift' THEN 'Obsequio registrado por administrador'
        ELSE 'Pago del periodo registrado al crear membresias'
      END,
      CASE WHEN v_origin = 'gift' THEN 'admin_gift' ELSE 'admin_assignment' END,
      v_actor_id,
      now()
    );

    v_distributed_payment := v_distributed_payment + v_payment_amount;

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
      v_classes,
      v_classes,
      CASE
        WHEN v_origin = 'gift' THEN format('Activacion de obsequio de %s clase(s)', v_classes)
        ELSE format('Activacion de plan %s, periodo %s de %s', v_plan.name, v_period, v_period_count)
      END,
      v_actor_id,
      now()
    );

    IF v_origin = 'paid' THEN
      v_start_date := v_end_date + 1;
    END IF;
  END LOOP;

  PERFORM public.sync_student_membership_operational_status(p_student_id);

  RETURN QUERY
  SELECT sm.*
  FROM public.student_memberships sm
  WHERE sm.assignment_batch_id = v_batch_id
  ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_student_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_student_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_student_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_student_membership_operational_status(
  p_student_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_lima timestamp := now() AT TIME ZONE 'America/Lima';
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_row_count integer := 0;
  v_total_changed integer := 0;
BEGIN
  UPDATE public.student_memberships
  SET
    status = 'expired',
    expired_at = COALESCE(expired_at, public.membership_end_date_expired_at(end_date)),
    expiration_reason = COALESCE(expiration_reason, 'end_date'),
    classes_remaining = GREATEST(COALESCE(classes_remaining, 0), 0),
    updated_at = now()
  WHERE (p_student_id IS NULL OR student_id = p_student_id)
    AND status = 'active'
    AND end_date IS NOT NULL
    AND end_date < v_today;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  UPDATE public.student_memberships
  SET
    status = 'expired',
    expired_at = COALESCE(expired_at, now()),
    expiration_reason = COALESCE(expiration_reason, 'no_classes_remaining'),
    classes_remaining = 0,
    updated_at = now()
  WHERE (p_student_id IS NULL OR student_id = p_student_id)
    AND status = 'active'
    AND classes_remaining <= 0;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  WITH target_students AS (
    SELECT s.id, s.is_active, s.operational_status
    FROM public.students s
    WHERE p_student_id IS NULL OR s.id = p_student_id
  ),
  computed AS (
    SELECT
      ts.id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships active_sm
          WHERE active_sm.student_id = ts.id
            AND active_sm.status = 'active'
            AND COALESCE(active_sm.classes_remaining, 0) > 0
            AND active_sm.start_date <= v_today
            AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
        ) THEN 'active'
        WHEN latest_expired.id IS NOT NULL
          AND v_now_lima >= (
            COALESCE(
              latest_expired.expired_at,
              public.membership_end_date_expired_at(latest_expired.end_date),
              latest_expired.updated_at,
              latest_expired.created_at
            ) AT TIME ZONE 'America/Lima'
          ) + interval '14 days'
          THEN 'paused'
        WHEN latest_expired.id IS NOT NULL
          THEN 'expired'
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships any_sm
          WHERE any_sm.student_id = ts.id
        ) THEN 'paused'
        WHEN COALESCE(ts.is_active, false)
          THEN 'active'
        ELSE 'paused'
      END AS next_status,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships active_sm
          WHERE active_sm.student_id = ts.id
            AND active_sm.status = 'active'
            AND COALESCE(active_sm.classes_remaining, 0) > 0
            AND active_sm.start_date <= v_today
            AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
        ) THEN 'Membresia activa vigente con saldo disponible'
        WHEN latest_expired.id IS NOT NULL
          AND v_now_lima >= (
            COALESCE(
              latest_expired.expired_at,
              public.membership_end_date_expired_at(latest_expired.end_date),
              latest_expired.updated_at,
              latest_expired.created_at
            ) AT TIME ZONE 'America/Lima'
          ) + interval '14 days'
          THEN 'Mas de 14 dias completos sin membresia activa'
        WHEN latest_expired.id IS NOT NULL
          THEN 'Membresia expirada dentro del periodo de seguimiento'
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships future_sm
          WHERE future_sm.student_id = ts.id
            AND future_sm.status = 'active'
            AND COALESCE(future_sm.classes_remaining, 0) > 0
            AND future_sm.start_date > v_today
        ) THEN 'Membresia programada aun no vigente'
        WHEN COALESCE(ts.is_active, false)
          THEN 'Alumno activo sin membresia registrada'
        ELSE 'Alumno sin membresia activa'
      END AS next_reason
    FROM target_students ts
    LEFT JOIN LATERAL (
      SELECT sm.*
      FROM public.student_memberships sm
      WHERE sm.student_id = ts.id
        AND sm.status = 'expired'
      ORDER BY
        COALESCE(
          sm.expired_at,
          public.membership_end_date_expired_at(sm.end_date),
          sm.updated_at,
          sm.created_at
        ) DESC,
        sm.created_at DESC,
        sm.id DESC
      LIMIT 1
    ) latest_expired ON true
  )
  UPDATE public.students s
  SET
    operational_status = computed.next_status,
    operational_status_reason = computed.next_reason,
    operational_status_updated_at = now(),
    is_active = computed.next_status = 'active',
    updated_at = now()
  FROM computed
  WHERE s.id = computed.id
    AND NOT public.is_student_protected_operational_status(s.operational_status)
    AND (
      s.operational_status IS DISTINCT FROM computed.next_status
      OR s.operational_status_reason IS DISTINCT FROM computed.next_reason
      OR s.is_active IS DISTINCT FROM (computed.next_status = 'active')
    );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  RETURN v_total_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO service_role;

-- Estas redefiniciones conservan las reglas vigentes y sustituyen solamente
-- la eleccion de membresia por el selector FIFO canonico.
CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_session_day_cutoff timestamptz;
  v_pending_reserved_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT * INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  v_session_day_cutoff := public.get_booking_day_cutoff(
    (v_session.start_at AT TIME ZONE 'America/Lima')::date
  );

  IF v_session_day_cutoff IS NOT NULL AND now() >= v_session_day_cutoff THEN
    RAISE EXCEPTION 'Las reservas para este dia se cerraron 2 horas antes del primer turno';
  END IF;

  LOOP
    SELECT * INTO v_membership
    FROM public.select_student_membership_for_date(
      v_student_id,
      (v_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_membership IS NULL THEN
      RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
    END IF;

    SELECT sm.* INTO v_membership
    FROM public.student_memberships sm
    WHERE sm.id = v_membership.id
    FOR UPDATE;

    SELECT COUNT(*)::integer INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count < COALESCE(v_membership.classes_remaining, 0) THEN
      EXIT;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(p_session, v_student_id);

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (CASE
      WHEN v_bow_usage_type = 'own' THEN 'ownbow'
      WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
      ELSE NULL
    END)::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.book_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_session(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_pending_reserved_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM public.sync_student_membership_operational_status(p_student_id);

  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  LOOP
    SELECT * INTO v_membership
    FROM public.select_student_membership_for_date(
      p_student_id,
      (v_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_membership IS NULL THEN
      RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
    END IF;

    SELECT sm.* INTO v_membership
    FROM public.student_memberships sm
    WHERE sm.id = v_membership.id
    FOR UPDATE;

    SELECT COUNT(*)::integer INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count < COALESCE(v_membership.classes_remaining, 0) THEN
      EXIT;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(p_session_id, p_student_id);

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (CASE
      WHEN v_bow_usage_type = 'own' THEN 'ownbow'
      WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
      ELSE NULL
    END)::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_weekly_attendance_review(p_sunday date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_pending_count integer := 0;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden revisar inasistencias semanales';
  END IF;

  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RETURN jsonb_build_object(
      'is_sunday', false,
      'week_start', NULL,
      'week_end', p_sunday,
      'pending_count', 0,
      'candidates', '[]'::jsonb
    );
  END IF;

  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede revisar una semana futura';
  END IF;

  v_week_start := p_sunday - 3;

  SELECT COUNT(*)::integer INTO v_pending_count
  FROM public.bookings pending_booking
  INNER JOIN public.sessions pending_session
    ON pending_session.id = pending_booking.session_id
  WHERE pending_booking.status = 'reserved'
    AND pending_booking.student_id IS NOT NULL
    AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
      BETWEEN v_week_start AND p_sunday;

  IF v_pending_count = 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'student_id', candidate.student_id,
          'student_name', candidate.student_name,
          'avatar_url', candidate.avatar_url,
          'membership_id', candidate.membership_id,
          'membership_name', candidate.membership_name,
          'membership_end', candidate.membership_end,
          'classes_remaining', candidate.classes_remaining,
          'membership_display_status', candidate.membership_display_status
        )
        ORDER BY candidate.student_name
      ),
      '[]'::jsonb
    )
    INTO v_candidates
    FROM (
      SELECT
        st.id AS student_id,
        st.full_name AS student_name,
        st.avatar_url,
        sm.id AS membership_id,
        sm.custom_name AS membership_name,
        sm.end_date AS membership_end,
        sm.classes_remaining,
        CASE
          WHEN sm.end_date IS NOT NULL AND sm.end_date <= p_sunday + 7
            THEN 'expiring'
          ELSE 'active'
        END AS membership_display_status
      FROM public.students st
      INNER JOIN LATERAL (
        SELECT selected.*
        FROM public.select_student_membership_for_date(st.id, p_sunday) selected
        WHERE selected.id IS NOT NULL
      ) sm ON true
      WHERE st.is_active = true
        AND COALESCE(st.operational_status, '') NOT IN ('retired', 'withdrawn', 'blocked', 'suspended')
        AND NOT EXISTS (
          SELECT 1
          FROM public.bookings b
          INNER JOIN public.sessions s ON s.id = b.session_id
          WHERE b.student_id = st.id
            AND b.status = 'attended'
            AND (s.start_at AT TIME ZONE 'America/Lima')::date
              BETWEEN v_week_start AND p_sunday
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.student_weekly_attendance swa
          WHERE swa.student_id = st.id
            AND swa.week_start = v_week_start
        )
    ) candidate;
  END IF;

  RETURN jsonb_build_object(
    'is_sunday', true,
    'week_start', v_week_start,
    'week_end', p_sunday,
    'pending_count', v_pending_count,
    'candidates', v_candidates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_attendance_review(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_weekly_no_show(
  p_student_id uuid,
  p_sunday date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_student_id uuid;
  v_membership public.student_memberships;
  v_existing_id uuid;
  v_weekly_attendance_id uuid;
  v_balance_after integer;
  v_pending_reserved_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar inasistencias semanales';
  END IF;

  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RAISE EXCEPTION 'La revision semanal solo puede registrarse para un domingo';
  END IF;

  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede registrar una inasistencia para una semana futura';
  END IF;

  v_week_start := p_sunday - 3;

  SELECT st.id INTO v_student_id
  FROM public.students st
  WHERE st.id = p_student_id
    AND st.is_active = true
    AND COALESCE(st.operational_status, '') NOT IN ('retired', 'withdrawn', 'blocked', 'suspended')
  FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado o no elegible';
  END IF;

  SELECT swa.id INTO v_existing_id
  FROM public.student_weekly_attendance swa
  WHERE swa.student_id = p_student_id
    AND swa.week_start = v_week_start;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings pending_booking
    INNER JOIN public.sessions pending_session
      ON pending_session.id = pending_booking.session_id
    WHERE pending_booking.status = 'reserved'
      AND pending_booking.student_id IS NOT NULL
      AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_week_start AND p_sunday
  ) THEN
    RAISE EXCEPTION 'Primero completa las asistencias pendientes de jueves a domingo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings attendance_booking
    INNER JOIN public.sessions attendance_session
      ON attendance_session.id = attendance_booking.session_id
    WHERE attendance_booking.student_id = p_student_id
      AND attendance_booking.status = 'attended'
      AND (attendance_session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_week_start AND p_sunday
  ) THEN
    RAISE EXCEPTION 'El alumno registra al menos una asistencia esta semana';
  END IF;

  LOOP
    SELECT * INTO v_membership
    FROM public.select_student_membership_for_date(p_student_id, p_sunday);

    IF v_membership IS NULL THEN
      RAISE EXCEPTION 'El alumno no tiene una membresia vigente con clases disponibles';
    END IF;

    SELECT sm.* INTO v_membership
    FROM public.student_memberships sm
    WHERE sm.id = v_membership.id
    FOR UPDATE;

    SELECT COUNT(*)::integer INTO v_pending_reserved_count
    FROM public.bookings reserved_booking
    WHERE reserved_booking.active_membership_id = v_membership.id
      AND reserved_booking.status = 'reserved';

    IF v_pending_reserved_count < COALESCE(v_membership.classes_remaining, 0) THEN
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.student_weekly_attendance (
    student_id,
    student_membership_id,
    week_start,
    week_end,
    status,
    classes_consumed,
    marked_by_profile_id,
    marked_at,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_week_start,
    p_sunday,
    'no_show',
    1,
    v_actor_id,
    now(),
    now()
  )
  ON CONFLICT (student_id, week_start) DO NOTHING
  RETURNING id INTO v_weekly_attendance_id;

  IF v_weekly_attendance_id IS NULL THEN
    SELECT swa.id INTO v_existing_id
    FROM public.student_weekly_attendance swa
    WHERE swa.student_id = p_student_id
      AND swa.week_start = v_week_start;

    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id
    );
  END IF;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    weekly_attendance_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_weekly_attendance_id,
    'weekly_no_show_consumed',
    -1,
    v_balance_after,
    format('Clase consumida por inasistencia semanal del %s al %s', v_week_start, p_sunday),
    v_actor_id,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_marked', false,
    'weekly_attendance_id', v_weekly_attendance_id,
    'classes_remaining', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id uuid,
  p_refund boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_balance_after integer;
  v_refunded boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN json_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'refunded', false,
      'message', 'Reserva ya cancelada'
    );
  END IF;

  IF v_booking.status NOT IN ('reserved', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'La reserva no puede cancelarse desde su estado actual';
  END IF;

  IF p_refund
    AND v_booking.active_membership_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.student_membership_id = v_booking.active_membership_id
        AND scl.movement_type = 'attendance_consumed'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.student_membership_id = v_booking.active_membership_id
        AND scl.movement_type = 'booking_cancelled_refund'
    )
  THEN
    UPDATE public.student_memberships
    SET
      classes_used = GREATEST(classes_used - 1, 0),
      classes_remaining = classes_remaining + 1,
      status = CASE
        WHEN status IN ('expired', 'consumed')
          AND (
            expiration_reason = 'no_classes_remaining'
            OR (status = 'consumed' AND classes_remaining <= 0)
          )
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
          THEN 'active'
        ELSE status
      END,
      expired_at = CASE
        WHEN status IN ('expired', 'consumed')
          AND (
            expiration_reason = 'no_classes_remaining'
            OR (status = 'consumed' AND classes_remaining <= 0)
          )
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
          THEN NULL
        ELSE expired_at
      END,
      expiration_reason = CASE
        WHEN status IN ('expired', 'consumed')
          AND (
            expiration_reason = 'no_classes_remaining'
            OR (status = 'consumed' AND classes_remaining <= 0)
          )
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
          THEN NULL
        ELSE expiration_reason
      END,
      updated_at = now()
    WHERE id = v_booking.active_membership_id
    RETURNING classes_remaining INTO v_balance_after;

    INSERT INTO public.student_credit_ledger (
      student_id,
      student_membership_id,
      booking_id,
      movement_type,
      delta,
      balance_after,
      reason,
      performed_by_profile_id,
      created_at
    )
    VALUES (
      v_booking.student_id,
      v_booking.active_membership_id,
      v_booking.id,
      'booking_cancelled_refund',
      1,
      v_balance_after,
      'Cancelacion admin posterior a asistencia; credito restaurado',
      v_actor_id,
      now()
    );

    v_refunded := true;
    PERFORM public.sync_student_membership_operational_status(v_booking.student_id);
  ELSIF v_booking.active_membership_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.student_membership_id = v_booking.active_membership_id
        AND scl.movement_type IN ('booking_cancelled_no_refund', 'booking_cancelled_refund')
    )
  THEN
    INSERT INTO public.student_credit_ledger (
      student_id,
      student_membership_id,
      booking_id,
      movement_type,
      delta,
      balance_after,
      reason,
      performed_by_profile_id,
      created_at
    )
    SELECT
      v_booking.student_id,
      v_booking.active_membership_id,
      v_booking.id,
      'booking_cancelled_no_refund',
      0,
      sm.classes_remaining,
      'Cancelacion admin sin devolucion porque no habia credito consumido',
      v_actor_id,
      now()
    FROM public.student_memberships sm
    WHERE sm.id = v_booking.active_membership_id;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_by_role = 'admin',
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'refunded', v_refunded,
    'message', CASE
      WHEN v_refunded THEN 'Reserva cancelada y credito restaurado'
      ELSE 'Reserva cancelada'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_booking(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cancel_booking(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cancel_session(
  p_session uuid,
  p_refund boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_session public.sessions;
  v_booking public.bookings;
  v_balance_after integer;
  v_cancelled_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  FOR v_booking IN
    SELECT *
    FROM public.bookings
    WHERE session_id = p_session
      AND status IN ('reserved', 'attended', 'no_show')
    FOR UPDATE
  LOOP
    IF p_refund
      AND v_booking.active_membership_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.student_credit_ledger scl
        WHERE scl.booking_id = v_booking.id
          AND scl.student_membership_id = v_booking.active_membership_id
          AND scl.movement_type = 'attendance_consumed'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_credit_ledger scl
        WHERE scl.booking_id = v_booking.id
          AND scl.student_membership_id = v_booking.active_membership_id
          AND scl.movement_type = 'booking_cancelled_refund'
      )
    THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        status = CASE
          WHEN status IN ('expired', 'consumed')
            AND (
              expiration_reason = 'no_classes_remaining'
              OR (status = 'consumed' AND classes_remaining <= 0)
            )
            AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
            THEN 'active'
          ELSE status
        END,
        expired_at = CASE
          WHEN status IN ('expired', 'consumed')
            AND (
              expiration_reason = 'no_classes_remaining'
              OR (status = 'consumed' AND classes_remaining <= 0)
            )
            AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
            THEN NULL
          ELSE expired_at
        END,
        expiration_reason = CASE
          WHEN status IN ('expired', 'consumed')
            AND (
              expiration_reason = 'no_classes_remaining'
              OR (status = 'consumed' AND classes_remaining <= 0)
            )
            AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
            THEN NULL
          ELSE expiration_reason
        END,
        updated_at = now()
      WHERE id = v_booking.active_membership_id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion de turno admin posterior a asistencia; credito restaurado',
        v_actor_id,
        now()
      );

      PERFORM public.sync_student_membership_operational_status(v_booking.student_id);
    ELSIF v_booking.active_membership_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_credit_ledger scl
        WHERE scl.booking_id = v_booking.id
          AND scl.student_membership_id = v_booking.active_membership_id
          AND scl.movement_type IN ('booking_cancelled_no_refund', 'booking_cancelled_refund')
      )
    THEN
      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      SELECT
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_no_refund',
        0,
        sm.classes_remaining,
        'Cancelacion de turno admin sin devolucion porque no habia credito consumido',
        v_actor_id,
        now()
      FROM public.student_memberships sm
      WHERE sm.id = v_booking.active_membership_id;
    END IF;

    UPDATE public.bookings
    SET
      status = 'cancelled',
      cancelled_by_profile_id = v_actor_id,
      cancelled_by_role = 'admin',
      cancelled_at = now(),
      updated_at = now()
    WHERE id = v_booking.id;

    v_cancelled_count := v_cancelled_count + 1;
  END LOOP;

  UPDATE public.sessions
  SET status = 'cancelled'
  WHERE id = p_session;

  RETURN v_cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_session(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cancel_session(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_session(uuid, boolean) TO authenticated, service_role;

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
  v_actor_id uuid := auth.uid();
  v_membership public.student_memberships;
  v_new_status text;
  v_new_total integer;
  v_new_used integer;
  v_new_remaining integer;
  v_new_amount numeric;
  v_updated public.student_memberships;
BEGIN
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

  PERFORM public.sync_student_membership_operational_status(v_membership.student_id);

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_student_membership(uuid, text, date, date, text, integer, integer, integer, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_student_membership(uuid, text, date, date, text, integer, integer, integer, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_student_membership(uuid, text, date, date, text, integer, integer, integer, numeric, text, text) TO authenticated, service_role;

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
  v_actor_id uuid := auth.uid();
  v_request public.student_membership_renewal_requests;
  v_plan public.membership_plans;
  v_membership_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_start_date date := (now() AT TIME ZONE 'America/Lima')::date;
  v_end_date date;
  v_notes text;
BEGIN
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

  v_end_date := CASE
    WHEN v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN NULL
    ELSE v_start_date + (v_plan.duration_days - 1)
  END;
  v_notes := COALESCE(NULLIF(btrim(p_notes), ''), 'Renovacion solicitada desde la app');

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
    membership_origin,
    assignment_batch_id,
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
    'paid',
    v_batch_id,
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
    CASE WHEN v_request.requested_price > 0 THEN 'paid' ELSE 'waived' END,
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

  PERFORM public.sync_student_membership_operational_status(v_request.student_id);

  RETURN v_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_membership_renewal_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_membership_renewal_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_membership_renewal_request(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  date_of_birth date,
  age integer,
  current_distance_m integer,
  category text,
  level text,
  student_is_active boolean,
  membership_name text,
  membership_start date,
  membership_end date,
  membership_status text,
  classes_total integer,
  classes_used integer,
  classes_remaining integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.date_of_birth,
    CASE
      WHEN s.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(v_today, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    s.category,
    s.level,
    (
      COALESCE(s.is_active, true)
      AND COALESCE(s.operational_status, 'active') = 'active'
      AND COALESCE(sm.available_classes, 0) > 0
    ) AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    CASE
      WHEN sm.id IS NULL THEN 'no_membership'
      WHEN sm.available_classes > 0 THEN 'active'
      ELSE 'no_classes'
    END AS membership_status,
    sm.classes_total,
    sm.classes_used,
    COALESCE(sm.available_classes, 0)::integer AS classes_remaining
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.id,
      sm_inner.custom_name,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.classes_total,
      sm_inner.classes_used,
      sm_inner.classes_remaining,
      commitments.reserved_count,
      GREATEST(
        COALESCE(sm_inner.classes_remaining, 0) - commitments.reserved_count,
        0
      )::integer AS available_classes
    FROM public.student_memberships sm_inner
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS reserved_count
      FROM public.bookings b
      WHERE b.active_membership_id = sm_inner.id
        AND b.status = 'reserved'
    ) commitments
    WHERE sm_inner.student_id = s.id
      AND sm_inner.status = 'active'
      AND sm_inner.start_date <= v_today
      AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today)
    ORDER BY
      CASE
        WHEN COALESCE(sm_inner.classes_remaining, 0) > commitments.reserved_count THEN 0
        ELSE 1
      END,
      sm_inner.start_date ASC,
      sm_inner.created_at ASC,
      sm_inner.id ASC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_dashboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_dashboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_dashboard(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_children()
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  current_distance_m integer,
  level text,
  is_active boolean,
  relationship text,
  self_profile_id uuid,
  classes_remaining integer,
  membership_status text,
  next_booking_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
  v_accessible_student_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  FOR v_accessible_student_id IN
    SELECT s.id
    FROM public.students s
    WHERE s.self_profile_id = auth.uid()

    UNION

    SELECT sg.student_id
    FROM public.student_guardians sg
    INNER JOIN public.students s ON s.id = sg.student_id
    WHERE sg.guardian_profile_id = auth.uid()
      AND s.self_profile_id IS DISTINCT FROM auth.uid()
  LOOP
    PERFORM public.sync_student_membership_operational_status(v_accessible_student_id);
  END LOOP;

  RETURN QUERY
  SELECT
    base.student_id,
    base.full_name,
    base.avatar_url,
    base.current_distance_m,
    base.level,
    (
      COALESCE(base.raw_is_active, true)
      AND COALESCE(base.operational_status, 'active') = 'active'
      AND COALESCE(sm.available_classes, 0) > 0
    ) AS is_active,
    base.relationship,
    base.self_profile_id,
    COALESCE(sm.available_classes, 0)::integer AS classes_remaining,
    CASE
      WHEN COALESCE(base.operational_status, 'active') <> 'active'
        THEN base.operational_status
      WHEN sm.id IS NULL THEN 'no_membership'
      WHEN sm.available_classes > 0 THEN 'active'
      ELSE 'no_classes'
    END AS membership_status,
    nb.start_at AS next_booking_at
  FROM (
    SELECT
      s.id AS student_id,
      s.full_name,
      s.avatar_url,
      s.current_distance_m,
      s.level,
      s.is_active AS raw_is_active,
      s.operational_status,
      'self'::text AS relationship,
      s.self_profile_id
    FROM public.students s
    WHERE s.self_profile_id = auth.uid()

    UNION ALL

    SELECT
      s.id AS student_id,
      s.full_name,
      s.avatar_url,
      s.current_distance_m,
      s.level,
      s.is_active AS raw_is_active,
      s.operational_status,
      COALESCE(sg.relationship, 'guardian') AS relationship,
      s.self_profile_id
    FROM public.student_guardians sg
    INNER JOIN public.students s ON s.id = sg.student_id
    WHERE sg.guardian_profile_id = auth.uid()
      AND s.self_profile_id IS DISTINCT FROM auth.uid()
  ) base
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.id,
      sm_inner.classes_remaining,
      commitments.reserved_count,
      GREATEST(
        COALESCE(sm_inner.classes_remaining, 0) - commitments.reserved_count,
        0
      )::integer AS available_classes
    FROM public.student_memberships sm_inner
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS reserved_count
      FROM public.bookings b
      WHERE b.active_membership_id = sm_inner.id
        AND b.status = 'reserved'
    ) commitments
    WHERE sm_inner.student_id = base.student_id
      AND sm_inner.status = 'active'
      AND sm_inner.start_date <= v_today_lima
      AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today_lima)
    ORDER BY
      CASE
        WHEN COALESCE(sm_inner.classes_remaining, 0) > commitments.reserved_count THEN 0
        ELSE 1
      END,
      sm_inner.start_date ASC,
      sm_inner.created_at ASC,
      sm_inner.id ASC
    LIMIT 1
  ) sm ON true
  LEFT JOIN LATERAL (
    SELECT session_row.start_at
    FROM public.bookings next_booking
    INNER JOIN public.sessions session_row ON session_row.id = next_booking.session_id
    WHERE next_booking.student_id = base.student_id
      AND next_booking.status = 'reserved'
      AND session_row.start_at > now()
    ORDER BY session_row.start_at ASC
    LIMIT 1
  ) nb ON true
  ORDER BY base.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_children() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_children() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_class_cards(
  p_student_id uuid DEFAULT NULL,
  p_student_membership_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_membership_id uuid,
  membership_name text,
  membership_status text,
  classes_total integer,
  classes_remaining integer,
  card_index integer,
  card_status text,
  booking_id uuid,
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  distance_m integer,
  bow_usage_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_membership_id uuid;
  v_reserved_count integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL
    OR COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RETURN;
  END IF;

  IF p_student_membership_id IS NOT NULL THEN
    SELECT
      sm.id,
      commitments.reserved_count
    INTO
      v_membership_id,
      v_reserved_count
    FROM public.student_memberships sm
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS reserved_count
      FROM public.bookings b
      WHERE b.active_membership_id = sm.id
        AND b.status = 'reserved'
    ) commitments
    WHERE sm.id = p_student_membership_id
      AND sm.student_id = v_student_id
      AND sm.status = 'active'
      AND sm.start_date <= v_today
      AND (sm.end_date IS NULL OR sm.end_date >= v_today);

    IF v_membership_id IS NULL THEN
      RAISE EXCEPTION 'Membresia no accesible para este alumno';
    END IF;
  ELSE
    SELECT
      sm.id,
      commitments.reserved_count
    INTO
      v_membership_id,
      v_reserved_count
    FROM public.student_memberships sm
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS reserved_count
      FROM public.bookings b
      WHERE b.active_membership_id = sm.id
        AND b.status = 'reserved'
    ) commitments
    WHERE sm.student_id = v_student_id
      AND sm.status = 'active'
      AND sm.start_date <= v_today
      AND (sm.end_date IS NULL OR sm.end_date >= v_today)
    ORDER BY
      CASE
        WHEN COALESCE(sm.classes_remaining, 0) > commitments.reserved_count THEN 0
        ELSE 1
      END,
      sm.start_date ASC,
      sm.created_at ASC,
      sm.id ASC
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH selected_membership AS (
    SELECT
      sm.id,
      sm.custom_name,
      sm.status,
      sm.classes_total,
      sm.classes_used,
      sm.classes_remaining,
      v_reserved_count AS reserved_count,
      GREATEST(
        sm.classes_total - LEAST(sm.classes_total, COALESCE(sm.classes_remaining, 0)),
        0
      )::integer AS used_slots,
      LEAST(
        sm.classes_total,
        GREATEST(COALESCE(sm.classes_remaining, 0) - v_reserved_count, 0)
      )::integer AS available_classes
    FROM public.student_memberships sm
    WHERE sm.id = v_membership_id
  ),
  consumed_bookings AS (
    SELECT
      row_number() OVER (
        ORDER BY COALESCE(session_row.start_at, b.created_at) ASC, b.created_at ASC, b.id ASC
      )::integer AS card_index,
      b.id AS booking_id,
      b.session_id,
      session_row.start_at,
      session_row.end_at,
      b.distance_m,
      b.bow_usage_type,
      b.status::text AS card_status
    FROM public.bookings b
    LEFT JOIN public.sessions session_row ON session_row.id = b.session_id
    WHERE b.student_id = v_student_id
      AND b.active_membership_id = v_membership_id
      AND b.status IN ('attended', 'no_show')
  ),
  reserved_bookings AS (
    SELECT
      row_number() OVER (
        ORDER BY session_row.start_at ASC, b.created_at ASC, b.id ASC
      )::integer AS reservation_index,
      b.id AS booking_id,
      b.session_id,
      session_row.start_at,
      session_row.end_at,
      b.distance_m,
      b.bow_usage_type
    FROM public.bookings b
    LEFT JOIN public.sessions session_row ON session_row.id = b.session_id
    WHERE b.student_id = v_student_id
      AND b.active_membership_id = v_membership_id
      AND b.status = 'reserved'
  )
  SELECT
    sm.id AS student_membership_id,
    sm.custom_name AS membership_name,
    sm.status AS membership_status,
    sm.classes_total,
    sm.available_classes AS classes_remaining,
    slot.card_index,
    CASE
      WHEN consumed.booking_id IS NOT NULL THEN consumed.card_status
      WHEN slot.card_index <= sm.used_slots THEN 'no_show'
      WHEN reserved.booking_id IS NOT NULL THEN 'reserved'
      ELSE 'available'
    END AS card_status,
    COALESCE(consumed.booking_id, reserved.booking_id) AS booking_id,
    COALESCE(consumed.session_id, reserved.session_id) AS session_id,
    COALESCE(consumed.start_at, reserved.start_at) AS start_at,
    COALESCE(consumed.end_at, reserved.end_at) AS end_at,
    COALESCE(consumed.distance_m, reserved.distance_m) AS distance_m,
    COALESCE(consumed.bow_usage_type, reserved.bow_usage_type) AS bow_usage_type
  FROM selected_membership sm
  CROSS JOIN LATERAL generate_series(1, sm.classes_total) AS slot(card_index)
  LEFT JOIN consumed_bookings consumed
    ON consumed.card_index = slot.card_index
  LEFT JOIN reserved_bookings reserved
    ON sm.used_slots + reserved.reservation_index = slot.card_index
  ORDER BY slot.card_index ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_class_cards(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_class_cards(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_class_cards(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_admin_quick_booking_students()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  classes_remaining integer,
  membership_type text,
  membership_start date,
  membership_end date,
  status text,
  distance_m integer,
  bow_poundage integer,
  has_own_bow boolean,
  assigned_bow boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.avatar_url,
    COALESCE(current_membership.available_classes, 0)::integer AS classes_remaining,
    COALESCE(current_membership.custom_name, '')::text AS membership_type,
    current_membership.start_date AS membership_start,
    current_membership.end_date AS membership_end,
    CASE
      WHEN current_membership.id IS NULL THEN 'no_membership'
      WHEN current_membership.available_classes <= 0 THEN 'no_classes'
      ELSE 'active'
    END AS status,
    s.current_distance_m AS distance_m,
    s.bow_poundage,
    COALESCE(s.has_own_bow, false) AS has_own_bow,
    COALESCE(s.assigned_bow, false) AS assigned_bow
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm.id,
      sm.custom_name,
      sm.start_date,
      sm.end_date,
      sm.classes_remaining,
      commitments.reserved_count,
      GREATEST(
        COALESCE(sm.classes_remaining, 0) - commitments.reserved_count,
        0
      )::integer AS available_classes
    FROM public.student_memberships sm
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS reserved_count
      FROM public.bookings b
      WHERE b.active_membership_id = sm.id
        AND b.status = 'reserved'
    ) commitments
    WHERE sm.student_id = s.id
      AND sm.status = 'active'
      AND sm.start_date <= v_today
      AND (sm.end_date IS NULL OR sm.end_date >= v_today)
    ORDER BY
      CASE
        WHEN COALESCE(sm.classes_remaining, 0) > commitments.reserved_count THEN 0
        ELSE 1
      END,
      sm.start_date ASC,
      sm.created_at ASC,
      sm.id ASC
    LIMIT 1
  ) current_membership ON true
  WHERE COALESCE(s.is_active, true) = true
    AND COALESCE(s.operational_status, 'active') = 'active'
  ORDER BY lower(s.full_name), s.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_quick_booking_students() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_quick_booking_students() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_quick_booking_students() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_admin_membership_reservation_commitments(
  p_student_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commitments jsonb;
  v_is_service_role boolean := COALESCE(
    (auth.jwt() ->> 'role') = 'service_role',
    false
  );
BEGIN
  IF NOT v_is_service_role AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT v_is_service_role THEN
    IF p_student_id IS NULL THEN
      IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'No autorizado para listar compromisos globales';
      END IF;
    ELSIF NOT public.is_admin_user()
      AND NOT public.can_access_student(p_student_id)
    THEN
      RAISE EXCEPTION 'No autorizado para consultar este alumno';
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      commitment.active_membership_id::text,
      commitment.reserved_count
    ),
    '{}'::jsonb
  )
  INTO v_commitments
  FROM (
    SELECT
      b.active_membership_id,
      COUNT(*)::bigint AS reserved_count
    FROM public.bookings b
    WHERE b.status = 'reserved'
      AND b.active_membership_id IS NOT NULL
      AND (p_student_id IS NULL OR b.student_id = p_student_id)
    GROUP BY b.active_membership_id
  ) commitment;

  RETURN v_commitments;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_membership_reservation_commitments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_membership_reservation_commitments(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_membership_reservation_commitments(uuid) TO authenticated, service_role;

COMMIT;
