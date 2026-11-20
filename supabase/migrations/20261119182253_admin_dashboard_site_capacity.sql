-- Aggregate only; the dashboard never receives student or bow identifiers.
CREATE OR REPLACE FUNCTION public.admin_dashboard_site_capacity()
RETURNS TABLE (
  session_id uuid, location_code text, location_name text,
  start_at timestamptz, end_at timestamptz,
  occupied_people integer, academy_bows_in_use integer, unknown_bow_usage integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  RETURN QUERY
  SELECT s.id, loc.code, loc.name, s.start_at, s.end_at,
    count(b.id)::integer,
    count(b.id) FILTER (WHERE b.bow_usage_type IN ('shared_inventory', 'assigned') OR (b.bow_usage_type IS NULL AND b.intro_client_id IS NOT NULL))::integer,
    count(b.id) FILTER (WHERE (b.bow_usage_type IS NULL AND b.intro_client_id IS NULL) OR (b.bow_usage_type IS NOT NULL AND b.bow_usage_type NOT IN ('own','shared_inventory','assigned')))::integer
  FROM public.sessions s
  JOIN public.academy_locations loc ON loc.id = s.location_id
  LEFT JOIN public.sessions overlapping_session ON overlapping_session.location_id = s.location_id
    AND overlapping_session.status = 'scheduled' AND overlapping_session.start_at < s.end_at AND overlapping_session.end_at > s.start_at
  LEFT JOIN public.bookings b ON b.session_id = overlapping_session.id AND b.status IN ('reserved', 'attended')
  WHERE s.status = 'scheduled' AND s.end_at > now()
    AND (s.start_at AT TIME ZONE 'America/Lima')::date <= (now() AT TIME ZONE 'America/Lima')::date + 6
    AND loc.code IN ('tiabaya','umacollo')
  GROUP BY s.id, loc.code, loc.name, s.start_at, s.end_at
  ORDER BY s.start_at, loc.name, s.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_site_capacity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_site_capacity() TO authenticated, service_role;
