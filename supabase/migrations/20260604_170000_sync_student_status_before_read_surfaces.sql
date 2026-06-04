-- ============================================================================
-- Fix: self-heal student operational status before student/guardian read surfaces
-- Fecha: 2026-06-04
-- Proposito:
-- 1. Evitar que Home muestre "Inactivo" cuando el alumno tiene membresia activa
--    vigente con clases disponibles, pero students.is_active quedo desfasado.
-- 2. Evitar que el Hub de tutor entregue un estado stale para uno de sus alumnos.
-- 3. Mantener la sincronizacion limitada al alumno solicitado o a los alumnos
--    accesibles para la cuenta actual.
-- ============================================================================

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
      ELSE EXTRACT(YEAR FROM age(current_date, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    s.category,
    s.level,
    (
      COALESCE(s.is_active, true)
      AND COALESCE(s.operational_status, 'active') = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.student_memberships active_sm
        WHERE active_sm.student_id = s.id
          AND active_sm.status = 'active'
          AND COALESCE(active_sm.classes_remaining, 0) > 0
          AND active_sm.start_date <= v_today
          AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
      )
    ) AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_used,
    CASE
      WHEN sm.status <> 'active' THEN 0
      WHEN sm.end_date IS NOT NULL AND sm.end_date < v_today THEN 0
      ELSE COALESCE(sm.classes_remaining, 0)
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
      sm_inner.classes_remaining
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = s.id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active'
          AND COALESCE(sm_inner.classes_remaining, 0) > 0
          AND sm_inner.start_date <= v_today
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
      AND sm.start_date <= v_today_lima
      AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
    ) AS is_active,
    base.relationship,
    base.self_profile_id,
    CASE
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND sm.start_date <= v_today_lima
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
      THEN COALESCE(sm.classes_remaining, 0)
      ELSE 0
    END AS classes_remaining,
    CASE
      WHEN COALESCE(base.operational_status, 'active') <> 'active'
        THEN base.operational_status
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND sm.start_date <= v_today_lima
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
          AND sm_inner.start_date <= v_today_lima
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

COMMENT ON FUNCTION public.get_student_dashboard(uuid) IS
  'Retorna dashboard del alumno luego de sincronizar su estado operativo desde la membresia vigente.';

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista alumnos accesibles para self/guardian luego de sincronizar solo esos alumnos desde su membresia vigente.';
