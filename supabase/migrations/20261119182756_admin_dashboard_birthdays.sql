CREATE OR REPLACE FUNCTION public.admin_dashboard_birthdays()
RETURNS TABLE (student_id uuid, full_name text, phone text, day_offset integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT s.id, s.full_name, s.phone,
    CASE WHEN to_char(s.date_of_birth, 'MM-DD') = to_char(v_today, 'MM-DD') THEN 0 ELSE 1 END
  FROM public.students s
  WHERE s.operational_status IN ('active', 'paused', 'expired')
    AND to_char(s.date_of_birth, 'MM-DD') IN (to_char(v_today, 'MM-DD'), to_char(v_today + 1, 'MM-DD'))
  ORDER BY 4, s.full_name, s.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_birthdays() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_birthdays() TO authenticated, service_role;
