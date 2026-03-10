-- ============================================================================
-- STUDENT DASHBOARD RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Exponer lecturas V2 para alumno y tutor
-- 2. Resolver el alumno accesible desde auth.uid()
-- 3. Mantener compatibilidad con widgets existentes del dashboard
-- ============================================================================

DROP FUNCTION IF EXISTS public.resolve_accessible_student_id(uuid);
CREATE OR REPLACE FUNCTION public.resolve_accessible_student_id(p_student_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_resolved_student_id uuid;
  v_guardian_student_count integer;
BEGIN
  v_auth_id := auth.uid();

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_student_id IS NOT NULL THEN
    IF public.can_access_student(p_student_id) THEN
      RETURN p_student_id;
    END IF;

    RAISE EXCEPTION 'No tienes acceso a este alumno';
  END IF;

  SELECT s.id
  INTO v_resolved_student_id
  FROM public.students s
  WHERE s.self_profile_id = v_auth_id
  LIMIT 1;

  IF v_resolved_student_id IS NOT NULL THEN
    RETURN v_resolved_student_id;
  END IF;

  SELECT COUNT(*)
  INTO v_guardian_student_count
  FROM public.student_guardians sg
  WHERE sg.guardian_profile_id = v_auth_id;

  IF v_guardian_student_count = 1 THEN
    SELECT sg.student_id
    INTO v_resolved_student_id
    FROM public.student_guardians sg
    WHERE sg.guardian_profile_id = v_auth_id
    LIMIT 1;

    RETURN v_resolved_student_id;
  END IF;

  IF v_guardian_student_count > 1 THEN
    RAISE EXCEPTION 'Debes seleccionar un alumno';
  END IF;

  RAISE EXCEPTION 'No hay alumno accesible para esta cuenta';
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_accessible_student_id(uuid) TO authenticated;

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
  self_profile_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  ORDER BY full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated;

DROP FUNCTION IF EXISTS public.get_student_dashboard(uuid);
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

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
    s.is_active AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_used,
    sm.classes_remaining
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
        WHEN sm_inner.status = 'active' THEN 0
        WHEN sm_inner.status = 'draft' THEN 1
        ELSE 2
      END,
      COALESCE(sm_inner.end_date, DATE '9999-12-31') DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_dashboard(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_next_booking();
DROP FUNCTION IF EXISTS public.get_my_next_booking(uuid);
CREATE OR REPLACE FUNCTION public.get_my_next_booking(p_student_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_result json;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT json_build_object(
    'start_at', s.start_at,
    'distance_m', COALESCE(b.distance_m, s.distance),
    'booking_id', b.id
  )
  INTO v_result
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
    AND b.status = 'reserved'
    AND s.start_at >= now()
  ORDER BY s.start_at ASC
  LIMIT 1;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_next_booking(uuid) TO authenticated;

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
  status text
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
    b.status::text AS status
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
  'Lista los alumnos accesibles para la cuenta autenticada. Incluye self para alumnos con cuenta propia y relaciones guardian para tutores.';

COMMENT ON FUNCTION public.get_student_dashboard(uuid) IS
  'Retorna el resumen V2 de un alumno accesible para la cuenta autenticada. Si p_student_id es null, resuelve self o el unico hijo vinculado.';

COMMENT ON FUNCTION public.get_my_next_booking(uuid) IS
  'Retorna la siguiente reserva del alumno accesible. Acepta p_student_id opcional para tutores.';

COMMENT ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) IS
  'Retorna el historial paginado del alumno accesible. Acepta p_student_id opcional para tutores.';
