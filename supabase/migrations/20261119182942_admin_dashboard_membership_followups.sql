CREATE OR REPLACE FUNCTION public.admin_dashboard_membership_followups()
RETURNS TABLE (student_id uuid, full_name text, end_date date, category text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT s.id, s.full_name, latest.end_date,
    CASE WHEN latest.end_date < v_today THEN 'expired' ELSE 'expiring' END
  FROM public.students s
  JOIN LATERAL (
    SELECT m.end_date FROM public.student_memberships m
    WHERE m.student_id = s.id AND m.status IN ('active', 'expired')
    ORDER BY m.end_date DESC NULLS FIRST, m.start_date DESC, m.id DESC LIMIT 1
  ) latest ON true
  WHERE s.operational_status IN ('active','paused','expired')
    AND latest.end_date BETWEEN v_today - 30 AND v_today + 7
  ORDER BY latest.end_date, s.full_name, s.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_membership_followups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_membership_followups() TO authenticated, service_role;
