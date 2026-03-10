-- ============================================================================
-- STUDENT DIVISION/GENDER CATEGORY LOGIC
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Agregar division y gender al alumno
-- 2. Calcular categoria dinamica por anio de nacimiento
-- 3. Mantener category como campo de compatibilidad
-- ============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_division_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_division_chk
  CHECK (division IS NULL OR division IN ('Recurvo', 'Compuesto', 'Raso'));

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_gender_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_gender_chk
  CHECK (gender IS NULL OR gender IN ('varones', 'damas'));

UPDATE public.students
SET division = CASE
  WHEN division IS NOT NULL THEN division
  WHEN category ILIKE 'Recurvo %' THEN 'Recurvo'
  WHEN category ILIKE 'Compuesto %' THEN 'Compuesto'
  WHEN category ILIKE 'Raso %' THEN 'Raso'
  ELSE NULL
END,
gender = CASE
  WHEN gender IS NOT NULL THEN gender
  WHEN category ILIKE '% damas' THEN 'damas'
  WHEN category ILIKE '% varones' THEN 'varones'
  ELSE NULL
END;

DROP FUNCTION IF EXISTS public.get_student_age_category(date, date);
CREATE OR REPLACE FUNCTION public.get_student_age_category(
  p_date_of_birth date,
  p_reference_date date DEFAULT current_date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_turning_age integer;
BEGIN
  IF p_date_of_birth IS NULL THEN
    RETURN NULL;
  END IF;

  v_turning_age := EXTRACT(YEAR FROM p_reference_date)::integer - EXTRACT(YEAR FROM p_date_of_birth)::integer;

  IF v_turning_age <= 9 THEN
    RETURN 'U10';
  ELSIF v_turning_age <= 12 THEN
    RETURN 'U13';
  ELSIF v_turning_age <= 14 THEN
    RETURN 'U15';
  ELSIF v_turning_age <= 17 THEN
    RETURN 'U18';
  ELSIF v_turning_age <= 20 THEN
    RETURN 'U21';
  ELSIF v_turning_age <= 49 THEN
    RETURN 'Mayores';
  END IF;

  RETURN 'Senior';
END;
$$;

DROP FUNCTION IF EXISTS public.build_student_category(date, text, text, date);
CREATE OR REPLACE FUNCTION public.build_student_category(
  p_date_of_birth date,
  p_division text,
  p_gender text,
  p_reference_date date DEFAULT current_date
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    concat_ws(
      ' ',
      NULLIF(btrim(p_division), ''),
      public.get_student_age_category(p_date_of_birth, p_reference_date),
      NULLIF(btrim(p_gender), '')
    ),
    ''
  )
$$;

UPDATE public.students
SET category = public.build_student_category(date_of_birth, division, gender, current_date)
WHERE division IS NOT NULL
   OR gender IS NOT NULL
   OR date_of_birth IS NOT NULL;

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
    COALESCE(
      public.build_student_category(s.date_of_birth, s.division, s.gender, current_date),
      s.category
    ) AS category,
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

GRANT EXECUTE ON FUNCTION public.get_student_age_category(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_student_category(date, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_dashboard(uuid) TO authenticated;

COMMENT ON COLUMN public.students.division IS
  'Division tecnica del alumno: Recurvo, Compuesto o Raso.';

COMMENT ON COLUMN public.students.gender IS
  'Genero competitivo del alumno: varones o damas.';
