-- ============================================================================
-- Membership renewal requests
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Mostrar renovacion self-service cuando membresia esta vencida y sin clases.
-- 2. Registrar solicitudes pendientes para validacion admin.
-- 3. Soportar precios regulares y afiliados Country Club Tiabaya.
-- ============================================================================

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS country_club_price numeric(10,2)
    CHECK (country_club_price IS NULL OR country_club_price >= 0);

CREATE OR REPLACE FUNCTION public.upsert_student_renewal_plan(
  p_name text,
  p_classes integer,
  p_base_price numeric,
  p_country_club_price numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  SELECT id
  INTO v_plan_id
  FROM public.membership_plans
  WHERE classes_included = p_classes
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.membership_plans (
      name,
      description,
      classes_included,
      duration_days,
      base_price,
      country_club_price,
      currency,
      is_active,
      created_at
    )
    VALUES (
      p_name,
      'Plan disponible para renovacion desde la app',
      p_classes,
      30,
      p_base_price,
      p_country_club_price,
      'PEN',
      true,
      now()
    );
  ELSE
    UPDATE public.membership_plans
    SET
      name = p_name,
      base_price = p_base_price,
      country_club_price = p_country_club_price,
      currency = 'PEN',
      is_active = true
    WHERE id = v_plan_id;
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM public.upsert_student_renewal_plan('4 clases', 4, 160, 130);
  PERFORM public.upsert_student_renewal_plan('8 clases', 8, 240, 170);
  PERFORM public.upsert_student_renewal_plan('12 clases', 12, 310, NULL);
  PERFORM public.upsert_student_renewal_plan('16 clases', 16, 370, NULL);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_student_renewal_plan(text, integer, numeric, numeric);

CREATE TABLE IF NOT EXISTS public.student_membership_renewal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  requested_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  membership_plan_id uuid NOT NULL REFERENCES public.membership_plans(id) ON DELETE RESTRICT,
  classes_included integer NOT NULL CHECK (classes_included > 0),
  requested_price numeric(10,2) NOT NULL CHECK (requested_price >= 0),
  regular_price numeric(10,2) NOT NULL CHECK (regular_price >= 0),
  country_club_price numeric(10,2) CHECK (country_club_price IS NULL OR country_club_price >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  is_country_club_price boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'pending_validation', 'approved', 'cancelled')),
  student_membership_id uuid REFERENCES public.student_memberships(id) ON DELETE SET NULL,
  admin_notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_membership_renewal_requests_student
  ON public.student_membership_renewal_requests(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_membership_renewal_requests_status
  ON public.student_membership_renewal_requests(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_membership_renewal_requests_one_pending
  ON public.student_membership_renewal_requests(student_id)
  WHERE status IN ('pending_payment', 'pending_validation');

ALTER TABLE public.student_membership_renewal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS renewal_requests_select_accessible ON public.student_membership_renewal_requests;
CREATE POLICY renewal_requests_select_accessible
  ON public.student_membership_renewal_requests
  FOR SELECT
  USING (public.is_admin_user() OR public.can_access_student(student_id));

DROP POLICY IF EXISTS renewal_requests_insert_accessible ON public.student_membership_renewal_requests;
CREATE POLICY renewal_requests_insert_accessible
  ON public.student_membership_renewal_requests
  FOR INSERT
  WITH CHECK (public.can_access_student(student_id));

DROP POLICY IF EXISTS renewal_requests_update_admin ON public.student_membership_renewal_requests;
CREATE POLICY renewal_requests_update_admin
  ON public.student_membership_renewal_requests
  FOR UPDATE
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.update_student_membership_renewal_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_membership_renewal_requests_updated_at
  ON public.student_membership_renewal_requests;
CREATE TRIGGER trg_student_membership_renewal_requests_updated_at
  BEFORE UPDATE ON public.student_membership_renewal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_student_membership_renewal_requests_updated_at();

ALTER TABLE public.admin_alert_queue
  DROP CONSTRAINT IF EXISTS admin_alert_queue_alert_type_check;

ALTER TABLE public.admin_alert_queue
  ADD CONSTRAINT admin_alert_queue_alert_type_check
  CHECK (alert_type IN (
    'session_reminder_24h',
    'session_reminder_2h',
    'membership_expiry',
    'low_classes',
    'payment_overdue',
    'membership_renewal_request'
  ));

DROP FUNCTION IF EXISTS public.get_membership_renewal_options(uuid);
CREATE OR REPLACE FUNCTION public.get_membership_renewal_options(
  p_student_id uuid DEFAULT NULL
)
RETURNS TABLE (
  plan_id uuid,
  name text,
  classes_included integer,
  duration_days integer,
  regular_price numeric,
  country_club_price numeric,
  effective_price numeric,
  currency text,
  is_country_club_member boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_membership_renewal_requests r
    WHERE r.student_id = v_student_id
      AND r.status IN ('pending_payment', 'pending_validation')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    mp.id AS plan_id,
    mp.name,
    mp.classes_included,
    mp.duration_days,
    COALESCE(mp.base_price, 0) AS regular_price,
    mp.country_club_price,
    CASE
      WHEN COALESCE(v_student.is_country_club_tiabaya_member, false)
        THEN COALESCE(mp.country_club_price, mp.base_price, 0)
      ELSE COALESCE(mp.base_price, 0)
    END AS effective_price,
    COALESCE(mp.currency, 'PEN') AS currency,
    COALESCE(v_student.is_country_club_tiabaya_member, false) AS is_country_club_member
  FROM public.membership_plans mp
  WHERE mp.is_active = true
    AND mp.classes_included IN (4, 8, 12, 16)
  ORDER BY mp.classes_included ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_membership_renewal_options(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.request_membership_renewal(uuid, uuid);
CREATE OR REPLACE FUNCTION public.request_membership_renewal(
  p_student_id uuid,
  p_membership_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_plan public.membership_plans;
  v_latest_membership public.student_memberships;
  v_request_id uuid;
  v_price numeric;
  v_is_country_price boolean;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a este alumno';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id
    AND COALESCE(is_active, true) = true;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  SELECT *
  INTO v_latest_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
  ORDER BY
    CASE WHEN sm.status = 'active' THEN 0 ELSE 1 END,
    COALESCE(sm.end_date, DATE '9999-12-31') DESC,
    sm.created_at DESC
  LIMIT 1;

  IF v_latest_membership IS NULL
    OR v_latest_membership.end_date IS NULL
    OR v_latest_membership.end_date >= current_date
    OR COALESCE(v_latest_membership.classes_remaining, 0) > 0
  THEN
    RAISE EXCEPTION 'La renovacion solo esta disponible para membresias vencidas y sin clases restantes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_membership_renewal_requests r
    WHERE r.student_id = p_student_id
      AND r.status IN ('pending_payment', 'pending_validation')
  ) THEN
    RAISE EXCEPTION 'Ya existe una solicitud de renovacion pendiente';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.membership_plans
  WHERE id = p_membership_plan_id
    AND is_active = true
    AND classes_included IN (4, 8, 12, 16);

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan de membresia no disponible';
  END IF;

  v_is_country_price := COALESCE(v_student.is_country_club_tiabaya_member, false)
    AND v_plan.country_club_price IS NOT NULL;
  v_price := CASE
    WHEN v_is_country_price THEN v_plan.country_club_price
    ELSE COALESCE(v_plan.base_price, 0)
  END;

  INSERT INTO public.student_membership_renewal_requests (
    student_id,
    requested_by_profile_id,
    membership_plan_id,
    classes_included,
    requested_price,
    regular_price,
    country_club_price,
    currency,
    is_country_club_price,
    status,
    requested_at,
    created_at,
    updated_at
  )
  VALUES (
    p_student_id,
    v_actor_id,
    v_plan.id,
    v_plan.classes_included,
    v_price,
    COALESCE(v_plan.base_price, 0),
    v_plan.country_club_price,
    COALESCE(v_plan.currency, 'PEN'),
    v_is_country_price,
    'pending_payment',
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.admin_alert_queue (
    alert_key,
    alert_type,
    channel,
    priority,
    student_id,
    recipient_name,
    title,
    message,
    scheduled_for,
    status,
    payload,
    created_at,
    updated_at
  )
  VALUES (
    'membership-renewal-request-' || v_request_id::text,
    'membership_renewal_request',
    'in_app',
    'high',
    p_student_id,
    v_student.full_name,
    'Nueva solicitud de renovacion',
    format('%s solicito renovar %s por S/ %s', v_student.full_name, v_plan.name, v_price),
    now(),
    'pending',
    jsonb_build_object(
      'request_id', v_request_id,
      'student_id', p_student_id,
      'plan_id', v_plan.id,
      'classes_included', v_plan.classes_included,
      'requested_price', v_price,
      'currency', COALESCE(v_plan.currency, 'PEN'),
      'is_country_club_price', v_is_country_price
    ),
    now(),
    now()
  )
  ON CONFLICT (alert_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'price', v_price,
    'currency', COALESCE(v_plan.currency, 'PEN')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_membership_renewal(uuid, uuid) TO authenticated;

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
  v_membership_id uuid;
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

  v_membership_id := public.admin_assign_membership_plan(
    v_request.student_id,
    v_request.membership_plan_id,
    current_date,
    v_request.requested_price,
    v_request.requested_price,
    COALESCE(NULLIF(btrim(p_notes), ''), 'Renovacion solicitada desde la app')
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

COMMENT ON TABLE public.student_membership_renewal_requests IS
  'Solicitudes de renovacion iniciadas por alumnos/tutores y aprobadas por administracion.';

COMMENT ON FUNCTION public.get_membership_renewal_options(uuid) IS
  'Lista planes de renovacion disponibles para un alumno accesible y aplica precio Country Club si corresponde.';

COMMENT ON FUNCTION public.request_membership_renewal(uuid, uuid) IS
  'Crea una solicitud pendiente de renovacion y notifica a administracion.';

COMMENT ON FUNCTION public.admin_approve_membership_renewal_request(uuid, text) IS
  'Aprueba una solicitud de renovacion, crea una nueva membresia activa y mueve la anterior a historico.';
