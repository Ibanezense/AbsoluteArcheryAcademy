-- ============================================================================
-- FIX: get_student_dashboard debe mostrar 0 clases si la membresia expiro
-- Fecha: 2026-03-04
-- Proposito:
--   Cuando la membresia mas reciente tiene status='active' pero end_date < hoy,
--   el dashboard mostraba classes_remaining > 0 aunque el alumno no puede reservar.
--   Ahora se prioriza membresias que esten vigentes (end_date >= hoy o null).
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
    -- Si la membresia expiro, reportar 0 clases restantes aunque haya saldo
    CASE
      WHEN sm.end_date IS NOT NULL AND sm.end_date < current_date THEN 0
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
      -- Primero: membresias activas Y vigentes
      CASE
        WHEN sm_inner.status = 'active'
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= current_date)
        THEN 0
      -- Segundo: membresias activas pero expiradas
        WHEN sm_inner.status = 'active' THEN 1
        WHEN sm_inner.status = 'draft' THEN 2
        ELSE 3
      END,
      COALESCE(sm_inner.end_date, DATE '9999-12-31') DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

COMMENT ON FUNCTION public.get_student_dashboard(uuid) IS
  'Retorna el resumen V2 de un alumno. Prioriza membresias vigentes y reporta 0 clases si la membresia expiro.';
