BEGIN;

DROP FUNCTION IF EXISTS public.admin_get_weekend_intro_capacity(date);

CREATE OR REPLACE FUNCTION public.admin_get_weekend_intro_capacity(
  p_reference_date date DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  equipment_capacity integer,
  equipment_reserved integer,
  spots_remaining integer,
  academy_capacity integer,
  academy_bows_used integer,
  intro_bows_capacity integer,
  intro_bows_used integer,
  location_id uuid,
  location_code text,
  location_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reference_date date := COALESCE(
    p_reference_date,
    (now() AT TIME ZONE 'America/Lima')::date
  );
  v_wednesday date := date_trunc('week', v_reference_date)::date + 2;
  v_sunday date := date_trunc('week', v_reference_date)::date + 6;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar la capacidad de pruebas';
  END IF;

  RETURN QUERY
  SELECT
    session.id,
    session.start_at,
    session.end_at,
    (2 + (availability.data->>'academy_capacity')::integer)::integer,
    (
      (availability.data->>'intro_reserved')::integer
      + (availability.data->>'academy_students_reserved')::integer
    )::integer,
    (availability.data->>'intro_spots_remaining')::integer,
    (availability.data->>'academy_capacity')::integer,
    (availability.data->>'academy_bows_used')::integer,
    2::integer,
    (availability.data->>'intro_bows_used')::integer,
    location.id,
    location.code,
    location.name
  FROM public.sessions session
  LEFT JOIN public.weekly_session_templates template ON template.id = session.weekly_template_id
  JOIN public.academy_locations location ON location.id = session.location_id
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(session.id) AS data
  ) availability
  WHERE session.status = 'scheduled'
    AND location.is_active = true
    AND (template.id IS NULL OR template.is_active = true)
    AND (
      template.allows_intro = true
      OR (template.id IS NULL AND location.code = 'umacollo')
    )
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_wednesday AND v_sunday
    AND (
      (
        location.code = 'umacollo'
        AND EXTRACT(ISODOW FROM session.start_at AT TIME ZONE 'America/Lima')::integer IN (3, 4, 5)
      )
      OR (
        location.code = 'tiabaya'
        AND EXTRACT(ISODOW FROM session.start_at AT TIME ZONE 'America/Lima')::integer IN (6, 7)
      )
    )
  ORDER BY session.start_at, session.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_weekend_intro_capacity(date) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_get_weekend_intro_capacity(date) IS
  'Returns intro-capacity sessions for Umacollo Wednesday-Friday and Tiabaya Saturday-Sunday, including manual Umacollo sessions without a weekly template.';

COMMIT;
