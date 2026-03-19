-- ============================================================================
-- FIX: HUB TUTOR - BALANCE DE CLASES EN MEMBRESIAS ACTIVAS
-- Fecha: 2026-03-18
-- Proposito:
-- 1. Mostrar classes_remaining cuando la membresia esta en status active
-- 2. Mantener 0 clases solo para membresias activas vencidas
-- 3. Evitar falsos 0 cuando la membresia activa inicia en fecha futura
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_my_children();
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  RETURN QUERY
  SELECT
    base.student_id,
    base.full_name,
    base.avatar_url,
    base.current_distance_m,
    base.level,
    base.is_active,
    base.relationship,
    base.self_profile_id,
    CASE
      WHEN sm.status = 'active'
        AND sm.end_date IS NOT NULL
        AND sm.end_date < v_today_lima
      THEN 0
      WHEN sm.status = 'active'
      THEN COALESCE(sm.classes_remaining, 0)
      ELSE 0
    END AS classes_remaining,
    CASE
      WHEN sm.status = 'active'
        AND sm.end_date IS NOT NULL
        AND sm.end_date < v_today_lima
      THEN 'expired'
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
      s.is_active,
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
      s.is_active,
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
      sm_inner.created_at
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = base.student_id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active'
          AND sm_inner.start_date <= v_today_lima
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today_lima)
        THEN 0
        WHEN sm_inner.status = 'active' THEN 1
        ELSE 2
      END,
      COALESCE(sm_inner.end_date, DATE '9999-12-31') DESC,
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

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista alumnos accesibles (self/guardian) con membresia, clases y proxima reserva para el hub.';
