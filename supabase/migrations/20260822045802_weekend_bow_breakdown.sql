BEGIN;

DROP FUNCTION IF EXISTS public.admin_get_weekend_intro_capacity(date);

CREATE FUNCTION public.admin_get_weekend_intro_capacity(
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
  intro_bows_used integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference_date date := COALESCE(
    p_reference_date,
    (now() AT TIME ZONE 'America/Lima')::date
  );
  v_saturday date := date_trunc('week', v_reference_date)::date + 5;
  v_sunday date := v_saturday + 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.start_at,
    s.end_at,
    (2 + (availability.data->>'academy_capacity')::integer)::integer,
    (
      (availability.data->>'intro_reserved')::integer
      + (availability.data->>'academy_students_reserved')::integer
    )::integer,
    (availability.data->>'intro_spots_remaining')::integer,
    (availability.data->>'academy_capacity')::integer,
    (availability.data->>'academy_bows_used')::integer,
    2::integer,
    (availability.data->>'intro_bows_used')::integer
  FROM public.sessions s
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(s.id) AS data
  ) availability
  WHERE s.status = 'scheduled'
    AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_saturday AND v_sunday
  -- Full sessions are intentionally returned so the admin dashboard remains complete.
  ORDER BY s.start_at;
END;
$$;

COMMENT ON FUNCTION public.admin_get_weekend_intro_capacity(date) IS
  'Admin weekend availability with separate occupied totals for the active 20 lb academy inventory and the two exclusive 18 lb intro bows; full sessions are intentionally returned.';

REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_weekend_intro_capacity(date) TO authenticated, service_role;

COMMIT;
