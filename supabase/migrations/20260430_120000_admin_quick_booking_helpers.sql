-- ============================================================================
-- Admin quick booking helpers
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Optimizar el selector de alumnos para reserva rapida.
-- 2. Exponer disponibilidad para admin sin aplicar restricciones self-service.
-- 3. Limitar reservas retroactivas admin a maximo 7 dias de antiguedad.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_admin_quick_booking_students();
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
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.avatar_url,
    COALESCE(current_membership.classes_remaining, 0)::integer AS classes_remaining,
    COALESCE(current_membership.custom_name, '')::text AS membership_type,
    current_membership.start_date AS membership_start,
    current_membership.end_date AS membership_end,
    CASE
      WHEN current_membership.id IS NULL THEN 'no_membership'
      WHEN current_membership.end_date IS NOT NULL AND current_membership.end_date < current_date THEN 'expired'
      WHEN COALESCE(current_membership.classes_remaining, 0) <= 0 THEN 'no_classes'
      ELSE 'active'
    END AS status,
    s.current_distance_m AS distance_m,
    s.bow_poundage,
    COALESCE(s.has_own_bow, false) AS has_own_bow,
    COALESCE(s.assigned_bow, false) AS assigned_bow
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT sm.*
    FROM public.student_memberships sm
    WHERE sm.student_id = s.id
      AND sm.status = 'active'
    ORDER BY
      CASE
        WHEN sm.start_date <= current_date
          AND (sm.end_date IS NULL OR sm.end_date >= current_date)
          THEN 0
        ELSE 1
      END,
      sm.start_date DESC,
      sm.created_at DESC
    LIMIT 1
  ) current_membership ON true
  WHERE COALESCE(s.is_active, true) = true
  ORDER BY lower(s.full_name), s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_quick_booking_students() TO authenticated;

DROP FUNCTION IF EXISTS public.get_admin_available_sessions_for_student(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_admin_available_sessions_for_student(
  p_student_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  already_reserved boolean,
  distance_m integer,
  bow_usage_type text,
  slot_capacity integer,
  distance_reserved integer,
  bow_capacity integer,
  bow_reserved integer,
  spots_for_student integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students;
  v_bow_usage_type text;
  v_min_date date;
  v_from_date date;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_min_date := (now() AT TIME ZONE 'America/Lima')::date - 7;
  v_from_date := GREATEST(p_date_from, v_min_date);

  IF p_date_to < v_from_date THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_student
  FROM public.students s
  WHERE s.id = p_student_id
    AND COALESCE(s.is_active, true) = true;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  WITH distance_caps AS (
    SELECT
      s.id AS session_id,
      s.start_at,
      s.end_at,
      s.status,
      v_student.current_distance_m AS distance_m,
      COALESCE(sda.slot_capacity, sda.targets * 4, 0) AS slot_capacity
    FROM public.sessions s
    LEFT JOIN public.session_distance_allocations sda
      ON sda.session_id = s.id
     AND sda.distance_m = v_student.current_distance_m
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') BETWEEN v_from_date AND p_date_to
  ),
  student_reservations AS (
    SELECT
      b.session_id,
      true AS already_reserved
    FROM public.bookings b
    WHERE b.student_id = p_student_id
      AND b.status = 'reserved'
  ),
  distance_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.distance_m = v_student.current_distance_m
      AND b.status = 'reserved'
    GROUP BY b.session_id
  ),
  bow_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.status = 'reserved'
      AND b.bow_usage_type = 'shared_inventory'
      AND b.bow_poundage = v_student.bow_poundage
    GROUP BY b.session_id
  )
  SELECT
    dc.session_id,
    dc.start_at,
    dc.end_at,
    dc.status::text,
    COALESCE(sr.already_reserved, false) AS already_reserved,
    dc.distance_m,
    v_bow_usage_type,
    dc.slot_capacity,
    COALESCE(dr.reserved_count, 0) AS distance_reserved,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(bi.quantity_active, 0)
      ELSE NULL
    END AS bow_capacity,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(br.reserved_count, 0)
      ELSE NULL
    END AS bow_reserved,
    CASE
      WHEN dc.status <> 'scheduled' THEN 0
      WHEN COALESCE(sr.already_reserved, false) THEN 0
      WHEN dc.slot_capacity <= 0 THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned')
        THEN GREATEST(dc.slot_capacity - COALESCE(dr.reserved_count, 0), 0)
      ELSE GREATEST(
        LEAST(
          dc.slot_capacity - COALESCE(dr.reserved_count, 0),
          COALESCE(bi.quantity_active, 0) - COALESCE(br.reserved_count, 0)
        ),
        0
      )
    END AS spots_for_student
  FROM distance_caps dc
  LEFT JOIN student_reservations sr
    ON sr.session_id = dc.session_id
  LEFT JOIN distance_reserved dr
    ON dr.session_id = dc.session_id
  LEFT JOIN bow_reserved br
    ON br.session_id = dc.session_id
  LEFT JOIN public.bow_inventory bi
    ON bi.draw_weight_lbs = v_student.bow_poundage
  WHERE dc.status = 'scheduled'
  ORDER BY dc.start_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_available_sessions_for_student(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_admin_quick_booking_students() IS
  'Lista compacta de alumnos activos para reserva rapida admin, sin ocultar alumnos por saldo actual.';

COMMENT ON FUNCTION public.get_admin_available_sessions_for_student(uuid, date, date) IS
  'Lista turnos scheduled para reserva rapida admin, limitada a maximo 7 dias hacia atras y sin bloquear disponibilidad por ser pasado.';
