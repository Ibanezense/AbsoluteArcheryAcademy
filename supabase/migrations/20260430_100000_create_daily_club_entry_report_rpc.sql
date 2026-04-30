-- ============================================================================
-- DAILY CLUB ENTRY REPORT
-- Fecha: 2026-04-30
-- Proposito: Centralizar la lista diaria de ingreso al club para reportes PDF.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_daily_club_entry_report(p_date date)
RETURNS TABLE(name text, dni text, type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'No autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id
    FROM public.sessions s
    WHERE (s.start_at AT TIME ZONE 'America/Lima')::date = p_date
  ),
  regular_rows AS (
    SELECT
      COALESCE(NULLIF(trim(st.full_name), ''), 'Desconocido')::text AS name,
      COALESCE(NULLIF(trim(st.dni), ''), 'N/A')::text AS dni,
      'student'::text AS type
    FROM public.bookings b
    INNER JOIN day_sessions ds ON ds.id = b.session_id
    INNER JOIN public.students st ON st.id = b.student_id
    WHERE b.status IN ('reserved', 'attended')
      AND b.intro_client_id IS NULL
  ),
  intro_rows AS (
    SELECT
      COALESCE(NULLIF(trim(ic.full_name), ''), 'Prueba')::text AS name,
      'N/A'::text AS dni,
      'intro'::text AS type
    FROM public.bookings b
    INNER JOIN day_sessions ds ON ds.id = b.session_id
    INNER JOIN public.intro_clients ic ON ic.id = b.intro_client_id
    WHERE b.status IN ('reserved', 'attended')
      AND b.intro_client_id IS NOT NULL
  )
  SELECT DISTINCT combined.name, combined.dni, combined.type
  FROM (
    SELECT * FROM regular_rows
    UNION ALL
    SELECT * FROM intro_rows
  ) combined
  ORDER BY combined.type, combined.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_club_entry_report(date) TO authenticated;

COMMENT ON FUNCTION public.get_daily_club_entry_report(date) IS
  'Devuelve alumnos y prospectos con reserva/atencion en una fecha para lista diaria de ingreso al club.';
