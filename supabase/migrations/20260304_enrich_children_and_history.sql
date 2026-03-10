-- ============================================================================
-- UI ENRICHMENT MIGRATIONS
-- Fecha: 2026-03-04
-- U5: get_my_children ahora incluye classes_remaining y próxima reserva
-- U7: get_my_booking_history_paginated ahora incluye distance_m y bow_usage_type
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- U5: get_my_children con resumen de membresía y próxima reserva
-- ────────────────────────────────────────────────────────────────────────────
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
    sm.classes_remaining,
    sm.status::text AS membership_status,
    nb.start_at AS next_booking_at
  FROM (
    -- Self students
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

    -- Guardian children
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
  -- Membresía activa más reciente
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.classes_remaining,
      sm_inner.status
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = base.student_id
      AND sm_inner.status = 'active'
      AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= current_date)
    ORDER BY sm_inner.start_date DESC
    LIMIT 1
  ) sm ON true
  -- Próxima reserva
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

-- ────────────────────────────────────────────────────────────────────────────
-- U7: get_my_booking_history_paginated con distancia y tipo de arco
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_booking_history_paginated(integer, integer);
DROP FUNCTION IF EXISTS public.get_my_booking_history_paginated(integer, integer, uuid);
CREATE OR REPLACE FUNCTION public.get_my_booking_history_paginated(
  page_number integer,
  page_size integer,
  p_student_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  start_at timestamptz,
  status text,
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
  v_offset integer;
BEGIN
  IF page_number < 1 THEN
    RAISE EXCEPTION 'page_number debe ser mayor o igual a 1';
  END IF;

  IF page_size < 1 OR page_size > 100 THEN
    RAISE EXCEPTION 'page_size debe estar entre 1 y 100';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  v_offset := (page_number - 1) * page_size;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    s.start_at,
    b.status::text AS status,
    b.distance_m,
    b.bow_usage_type
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
  ORDER BY s.start_at DESC
  LIMIT page_size
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista los alumnos accesibles con resumen de membresia (classes_remaining, status) y proxima reserva.';

COMMENT ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) IS
  'Historial paginado con distance_m y bow_usage_type para mostrar detalles en el frontend.';
