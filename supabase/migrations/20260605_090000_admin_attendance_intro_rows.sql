-- ============================================================================
-- ADMIN ATTENDANCE INTRO ROWS
-- Fecha: 2026-06-05
-- Proposito:
-- 1. Incluir clases de prueba en el roster diario de asistencia
-- 2. Mantener un solo turno por horario con reservas regulares e intro
-- 3. Exponer un discriminador estable para que el frontend renderice filas diferenciadas
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_daily_roster(date);
CREATE OR REPLACE FUNCTION public.get_daily_roster(p_date date)
RETURNS TABLE (
  booking_id uuid,
  session_id uuid,
  session_start_at timestamptz,
  entry_type text,
  student_id uuid,
  intro_client_id uuid,
  student_name text,
  student_avatar_url text,
  booking_status text,
  admin_notes text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden ver el roster diario';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.session_id,
    s.start_at AS session_start_at,
    CASE WHEN b.intro_client_id IS NOT NULL THEN 'intro' ELSE 'student' END AS entry_type,
    st.id AS student_id,
    ic.id AS intro_client_id,
    COALESCE(st.full_name, ic.full_name, 'Sin nombre') AS student_name,
    st.avatar_url AS student_avatar_url,
    b.status::text AS booking_status,
    b.admin_notes,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  LEFT JOIN public.students st
    ON st.id = b.student_id
  LEFT JOIN public.intro_clients ic
    ON ic.id = b.intro_client_id
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = p_date
    AND b.status IN ('reserved', 'attended', 'no_show')
  ORDER BY
    s.start_at ASC,
    lower(COALESCE(st.full_name, ic.full_name, 'Sin nombre')) ASC,
    COALESCE(st.full_name, ic.full_name, 'Sin nombre') ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_roster(date) TO authenticated;

COMMENT ON FUNCTION public.get_daily_roster(date) IS
  'Retorna el roster diario de asistencia para admin incluyendo alumnos e intros dentro del mismo turno.';
