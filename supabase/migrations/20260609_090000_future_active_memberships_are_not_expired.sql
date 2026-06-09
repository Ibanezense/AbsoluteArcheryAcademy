-- ============================================================================
-- Fix: future-start active memberships are not expired on read surfaces
-- Fecha: 2026-06-09
-- Proposito:
-- 1. Evitar que alumnos recien creados con membresia activa que inicia en una
--    fecha futura aparezcan como vencidos en el hub del tutor.
-- 2. Mantener la validacion de reservas por fecha de clase en los RPCs de
--    reserva; aqui solo se corrige el estado operativo y visual.
-- ============================================================================

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
            AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
        ) THEN 'active'
        WHEN latest_expired.id IS NOT NULL
          AND (
            v_now_lima >= (
              COALESCE(
                latest_expired.expired_at,
                public.membership_end_date_expired_at(latest_expired.end_date),
                latest_expired.updated_at,
                latest_expired.created_at
              ) AT TIME ZONE 'America/Lima'
            ) + interval '14 days'
          )
          THEN 'paused'
        WHEN latest_expired.id IS NOT NULL
          THEN 'expired'
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
            AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
        ) THEN 'Membresia activa con saldo disponible'
        WHEN latest_expired.id IS NOT NULL
          AND (
            v_now_lima >= (
              COALESCE(
                latest_expired.expired_at,
                public.membership_end_date_expired_at(latest_expired.end_date),
                latest_expired.updated_at,
                latest_expired.created_at
              ) AT TIME ZONE 'America/Lima'
            ) + interval '14 days'
          )
          THEN 'Mas de 14 dias completos sin membresia activa'
        WHEN latest_expired.id IS NOT NULL
          THEN 'Membresia expirada dentro del periodo de seguimiento'
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
GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO service_role;

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
  v_has_usable_membership boolean := false;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.student_memberships active_sm
    WHERE active_sm.student_id = v_student_id
      AND active_sm.status = 'active'
      AND COALESCE(active_sm.classes_remaining, 0) > 0
      AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
  )
  INTO v_has_usable_membership;

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.date_of_birth,
    CASE
      WHEN s.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(current_date, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    s.category,
    s.level,
    (
      COALESCE(s.is_active, true)
      AND COALESCE(s.operational_status, 'active') = 'active'
      AND v_has_usable_membership
    ) AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    CASE
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND (sm.end_date IS NULL OR sm.end_date >= v_today)
      THEN 'active'
      WHEN sm.status = 'active' THEN 'expired'
      ELSE sm.status
    END AS membership_status,
    sm.classes_total,
    sm.classes_used,
    CASE
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND (sm.end_date IS NULL OR sm.end_date >= v_today)
      THEN COALESCE(sm.classes_remaining, 0)
      ELSE 0
    END AS classes_remaining
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.custom_name,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.status,
      sm_inner.classes_total,
      sm_inner.classes_used,
      sm_inner.classes_remaining,
      sm_inner.expired_at,
      sm_inner.created_at
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = s.id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active'
          AND COALESCE(sm_inner.classes_remaining, 0) > 0
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today)
        THEN 0
        WHEN sm_inner.status = 'expired' THEN 1
        WHEN sm_inner.status = 'historical' THEN 2
        ELSE 3
      END,
      COALESCE(sm_inner.expired_at, public.membership_end_date_expired_at(sm_inner.end_date), sm_inner.created_at) DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_dashboard(uuid) TO authenticated;

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
  FOR v_accessible_student_id IN
    SELECT s.id
    FROM public.students s
    WHERE s.self_profile_id = auth.uid()

    UNION

    SELECT sg.student_id
    FROM public.student_guardians sg
    INNER JOIN public.students s
      ON s.id = sg.student_id
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
      AND sm.status = 'active'
      AND COALESCE(sm.classes_remaining, 0) > 0
      AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
    ) AS is_active,
    base.relationship,
    base.self_profile_id,
    CASE
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
      THEN COALESCE(sm.classes_remaining, 0)
      ELSE 0
    END AS classes_remaining,
    CASE
      WHEN COALESCE(base.operational_status, 'active') <> 'active'
        THEN base.operational_status
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
        THEN 'active'
      WHEN sm.status = 'active' THEN 'expired'
      ELSE sm.status::text
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
    INNER JOIN public.students s
      ON s.id = sg.student_id
    WHERE sg.guardian_profile_id = auth.uid()
      AND s.self_profile_id IS DISTINCT FROM auth.uid()
  ) base
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.classes_remaining,
      sm_inner.status,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.expired_at,
      sm_inner.created_at
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = base.student_id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active'
          AND COALESCE(sm_inner.classes_remaining, 0) > 0
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today_lima)
        THEN 0
        WHEN sm_inner.status = 'expired' THEN 1
        WHEN sm_inner.status = 'historical' THEN 2
        ELSE 3
      END,
      COALESCE(sm_inner.expired_at, public.membership_end_date_expired_at(sm_inner.end_date), sm_inner.created_at) DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  LEFT JOIN LATERAL (
    SELECT s_sess.start_at
    FROM public.bookings b_next
    INNER JOIN public.sessions s_sess ON s_sess.id = b_next.session_id
    WHERE b_next.student_id = base.student_id
      AND b_next.status = 'reserved'
      AND s_sess.start_at > now()
    ORDER BY s_sess.start_at ASC
    LIMIT 1
  ) nb ON true
  ORDER BY base.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated;

COMMENT ON FUNCTION public.sync_student_membership_operational_status(uuid) IS
  'Sincroniza estado operativo considerando activa una membresia con saldo y fecha de fin vigente, aunque su inicio sea futuro.';

COMMENT ON FUNCTION public.get_student_dashboard(uuid) IS
  'Retorna dashboard del alumno sin marcar como vencidas las membresias activas con inicio futuro.';

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista alumnos accesibles sin marcar como vencidas las membresias activas con inicio futuro.';
