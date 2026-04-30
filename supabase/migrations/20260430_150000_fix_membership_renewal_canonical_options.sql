-- ============================================================================
-- Fix: canonical membership renewal packages
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Mostrar exactamente 4 paquetes de renovacion: 4, 8, 12 y 16 clases.
-- 2. Evitar duplicados por planes historicos activos con la misma cantidad.
-- 3. Aplicar precio CCT solo si el alumno tiene marca Country Club Tiabaya.
-- ============================================================================

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS country_club_price numeric(10,2)
    CHECK (country_club_price IS NULL OR country_club_price >= 0);

CREATE OR REPLACE FUNCTION public.upsert_canonical_renewal_plan(
  p_name text,
  p_classes integer,
  p_base_price numeric,
  p_country_club_price numeric DEFAULT NULL
)
RETURNS uuid
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
    AND COALESCE(base_price, 0) = p_base_price
    AND COALESCE(country_club_price, -1) = COALESCE(p_country_club_price, -1)
  ORDER BY
    CASE WHEN name = p_name THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(is_active, true) THEN 0 ELSE 1 END,
    created_at DESC
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
      'Plan canonico disponible para renovacion desde la app',
      p_classes,
      30,
      p_base_price,
      p_country_club_price,
      'PEN',
      true,
      now()
    )
    RETURNING id INTO v_plan_id;
  ELSE
    UPDATE public.membership_plans
    SET
      name = p_name,
      description = COALESCE(NULLIF(description, ''), 'Plan canonico disponible para renovacion desde la app'),
      duration_days = 30,
      base_price = p_base_price,
      country_club_price = p_country_club_price,
      currency = 'PEN',
      is_active = true
    WHERE id = v_plan_id;
  END IF;

  RETURN v_plan_id;
END;
$$;

DO $$
BEGIN
  PERFORM public.upsert_canonical_renewal_plan('4 clases', 4, 160, 130);
  PERFORM public.upsert_canonical_renewal_plan('8 clases', 8, 240, 170);
  PERFORM public.upsert_canonical_renewal_plan('12 clases', 12, 310, NULL);
  PERFORM public.upsert_canonical_renewal_plan('16 clases', 16, 370, NULL);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_canonical_renewal_plan(text, integer, numeric, numeric);

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
  v_is_country_club_member boolean;
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

  v_is_country_club_member := COALESCE(v_student.is_country_club_tiabaya_member, false);

  RETURN QUERY
  WITH canonical_packages(classes_included, name, regular_price, country_club_price) AS (
    VALUES
      (4, '4 clases'::text, 160::numeric, 130::numeric),
      (8, '8 clases'::text, 240::numeric, 170::numeric),
      (12, '12 clases'::text, 310::numeric, NULL::numeric),
      (16, '16 clases'::text, 370::numeric, NULL::numeric)
  )
  SELECT
    mp.id AS plan_id,
    cp.name,
    cp.classes_included,
    COALESCE(mp.duration_days, 30) AS duration_days,
    cp.regular_price,
    cp.country_club_price,
    CASE
      WHEN v_is_country_club_member AND cp.country_club_price IS NOT NULL
        THEN cp.country_club_price
      ELSE cp.regular_price
    END AS effective_price,
    COALESCE(mp.currency, 'PEN') AS currency,
    v_is_country_club_member AS is_country_club_member
  FROM canonical_packages cp
  CROSS JOIN LATERAL (
    SELECT candidate.*
    FROM public.membership_plans candidate
    WHERE candidate.is_active = true
      AND candidate.classes_included = cp.classes_included
      AND COALESCE(candidate.base_price, 0) = cp.regular_price
      AND COALESCE(candidate.country_club_price, -1) = COALESCE(cp.country_club_price, -1)
    ORDER BY
      CASE WHEN candidate.name = cp.name THEN 0 ELSE 1 END,
      candidate.created_at DESC
    LIMIT 1
  ) mp
  ORDER BY cp.classes_included ASC;
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
  v_regular_price numeric;
  v_country_club_price numeric;
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

  v_regular_price := CASE v_plan.classes_included
    WHEN 4 THEN 160
    WHEN 8 THEN 240
    WHEN 12 THEN 310
    WHEN 16 THEN 370
    ELSE NULL
  END;

  v_country_club_price := CASE v_plan.classes_included
    WHEN 4 THEN 130
    WHEN 8 THEN 170
    ELSE NULL
  END;

  IF v_regular_price IS NULL
    OR COALESCE(v_plan.base_price, 0) <> v_regular_price
    OR COALESCE(v_plan.country_club_price, -1) <> COALESCE(v_country_club_price, -1)
  THEN
    RAISE EXCEPTION 'Plan de renovacion no disponible';
  END IF;

  v_is_country_price := COALESCE(v_student.is_country_club_tiabaya_member, false)
    AND v_country_club_price IS NOT NULL;
  v_price := CASE
    WHEN v_is_country_price THEN v_country_club_price
    ELSE v_regular_price
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
    v_regular_price,
    v_country_club_price,
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

COMMENT ON FUNCTION public.get_membership_renewal_options(uuid) IS
  'Lista exactamente 4 paquetes canonicos de renovacion y aplica precio Country Club solo si el alumno tiene marca CCT.';

COMMENT ON FUNCTION public.request_membership_renewal(uuid, uuid) IS
  'Crea una solicitud pendiente de renovacion solo para paquetes canonicos 4/8/12/16 y notifica a administracion.';
