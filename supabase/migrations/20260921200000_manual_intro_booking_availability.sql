BEGIN;

DROP FUNCTION IF EXISTS public.get_available_intro_sessions(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_available_intro_sessions(
  p_date_from date,
  p_date_to date,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  equipment_capacity integer,
  equipment_reserved integer,
  spots_remaining integer,
  location_code text,
  location_name text,
  location_address text,
  location_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar turnos de prueba';
  END IF;

  RETURN QUERY
  SELECT
    session.id,
    session.start_at,
    session.end_at,
    (availability.data->>'physical_capacity')::integer,
    ((availability.data->>'physical_capacity')::integer
      - (availability.data->>'physical_spots_remaining')::integer)::integer,
    (availability.data->>'physical_spots_remaining')::integer,
    location.code,
    location.name,
    location.address,
    location.id
  FROM public.sessions session
  JOIN public.academy_locations location ON location.id = session.location_id
  LEFT JOIN public.weekly_session_templates template ON template.id = session.weekly_template_id
  CROSS JOIN LATERAL (
    SELECT public.get_multisite_session_availability(session.id, NULL, true, NULL) AS data
  ) availability
  WHERE session.status = 'scheduled'
    AND session.start_at > now()
    AND location.is_active = true
    AND (template.id IS NULL OR template.is_active = true)
    AND (
      template.allows_intro = true
      OR (template.id IS NULL AND location.code = 'umacollo')
    )
    AND (p_location_id IS NULL OR session.location_id = p_location_id)
    AND (location.opens_on IS NULL OR (session.start_at AT TIME ZONE location.timezone)::date >= location.opens_on)
    AND (session.start_at AT TIME ZONE location.timezone)::date BETWEEN p_date_from AND p_date_to
    AND COALESCE((availability.data->>'available')::boolean, false)
    AND COALESCE((availability.data->>'physical_spots_remaining')::integer, 0) > 0
  ORDER BY session.start_at, location.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_intro_sessions(date, date, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_available_intro_sessions(date, date, uuid) IS
  'Returns future intro sessions with capacity, including manual Umacollo sessions without a weekly template.';

COMMIT;
