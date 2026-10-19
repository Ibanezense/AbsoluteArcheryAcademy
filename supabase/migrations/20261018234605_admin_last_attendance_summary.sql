-- A JSON aggregate avoids PostgREST's row cap and returns only one summary per student.
CREATE OR REPLACE FUNCTION public.get_admin_last_attendance_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar el resumen de asistencias'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(summary ORDER BY summary.student_id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT b.student_id, MAX(COALESCE(s.start_at, b.attendance_marked_at)) AS last_attendance_at
    FROM public.bookings b
    LEFT JOIN public.sessions s ON s.id = b.session_id
    WHERE b.status = 'attended' AND b.student_id IS NOT NULL
    GROUP BY b.student_id
    HAVING MAX(COALESCE(s.start_at, b.attendance_marked_at)) IS NOT NULL
  ) summary;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_last_attendance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_last_attendance_summary() TO authenticated;
COMMENT ON FUNCTION public.get_admin_last_attendance_summary() IS
  'Admin-only last attended session date by students.id; marking time only if session time is absent. Read-only.';
