BEGIN;

ALTER TABLE public.intro_clients ADD COLUMN IF NOT EXISTS dni text;

CREATE OR REPLACE FUNCTION public.intro_site_limits(p_session_id uuid, p_exclude_booking_id uuid DEFAULT NULL)
RETURNS TABLE (physical_remaining integer, academy_remaining integer)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH target AS (
    SELECT s.location_id, s.start_at, s.end_at, l.code
    FROM public.sessions s JOIN public.academy_locations l ON l.id = s.location_id
    WHERE s.id = p_session_id
  ), occupation AS (
    SELECT greatest(s.start_at, t.start_at) AS starts, least(s.end_at, t.end_at) AS ends,
      CASE WHEN b.bow_usage_type::text = 'own' AND b.intro_client_id IS NULL THEN 0 ELSE 1 END AS academy_bows
    FROM target t
    JOIN public.sessions s ON s.location_id = t.location_id AND s.status = 'scheduled'
      AND s.start_at < t.end_at AND s.end_at > t.start_at
    JOIN public.bookings b ON b.session_id = s.id AND b.status IN ('reserved', 'attended')
      AND b.id IS DISTINCT FROM p_exclude_booking_id
  ), events AS (
    SELECT starts AS instant, 1 AS people, academy_bows AS bows FROM occupation
    UNION ALL
    SELECT ends, -1, -academy_bows FROM occupation
  ), running AS (
    SELECT sum(sum(people)) OVER (ORDER BY instant) AS people, sum(sum(bows)) OVER (ORDER BY instant) AS bows
    FROM events GROUP BY instant
  )
  SELECT
    CASE WHEN t.code = 'umacollo' THEN greatest(4 - coalesce((SELECT max(people) FROM running), 0), 0)::integer END,
    CASE WHEN t.code = 'tiabaya' THEN greatest(6 - coalesce((SELECT max(bows) FROM running), 0), 0)::integer END
  FROM target t;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.get_multisite_session_availability_base(uuid,uuid,boolean,uuid)') IS NULL THEN
    ALTER FUNCTION public.get_multisite_session_availability(uuid, uuid, boolean, uuid) RENAME TO get_multisite_session_availability_base;
  END IF;
  IF to_regprocedure('public.intro_calendar_resource_spots(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.intro_calendar_spots(uuid, uuid) RENAME TO intro_calendar_resource_spots;
  END IF;
  IF to_regprocedure('public.admin_get_intro_calendar_base(date,date,uuid)') IS NULL THEN
    ALTER FUNCTION public.admin_get_intro_calendar(date, date, uuid) RENAME TO admin_get_intro_calendar_base;
  END IF;
END
$$;

-- At Tiabaya, the trial limit is the shared academy-bow quota. The legacy
-- target-space counter also includes own bows and can run out before that quota.
CREATE OR REPLACE FUNCTION public.get_multisite_session_availability(
  p_session_id uuid, p_student_id uuid DEFAULT NULL, p_is_intro boolean DEFAULT false,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_current jsonb; v_remaining integer;
BEGIN
  v_current := public.get_multisite_session_availability_base(p_session_id, p_student_id, p_is_intro, p_exclude_booking_id);
  IF p_is_intro IS DISTINCT FROM true OR p_student_id IS NOT NULL OR v_current->>'location_code' IS DISTINCT FROM 'tiabaya' THEN RETURN v_current; END IF;
  SELECT academy_remaining INTO v_remaining FROM public.intro_site_limits(p_session_id, p_exclude_booking_id);
  RETURN v_current || jsonb_build_object(
    'physical_capacity', 6,
    'physical_spots_remaining', v_remaining,
    'available', coalesce(v_remaining > 0 AND (v_current->>'shared_bows_remaining')::integer > 0, false)
      AND EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND status = 'scheduled'),
    'message', CASE WHEN v_remaining = 0 THEN 'El turno ya no tiene arcos de academia disponibles'
      WHEN (v_current->>'shared_bows_remaining')::integer <= 0 THEN 'No quedan arcos compatibles para la prueba'
      ELSE 'Cupo disponible' END
  );
END
$$;

CREATE OR REPLACE FUNCTION public.intro_calendar_spots(p_session_id uuid, p_exclude_booking_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT least(public.intro_calendar_resource_spots(p_session_id, p_exclude_booking_id), limits.physical_remaining, limits.academy_remaining)
    FROM public.intro_site_limits(p_session_id, p_exclude_booking_id) limits
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.admin_get_intro_calendar(p_date_from date, p_date_to date, p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(slot.item || jsonb_build_object(
    'physical_remaining', limits.physical_remaining,
    'academy_remaining', limits.academy_remaining,
    'clients', coalesce((
      SELECT jsonb_agg(appointment.item || jsonb_build_object('dni', person.dni) ORDER BY appointment.position)
      FROM jsonb_array_elements(slot.item->'clients') WITH ORDINALITY AS appointment(item, position)
      LEFT JOIN public.intro_clients person ON person.id = (appointment.item->>'intro_client_id')::uuid
    ), '[]'::jsonb)
  ) ORDER BY slot.position), '[]'::jsonb)
  FROM jsonb_array_elements(public.admin_get_intro_calendar_base(p_date_from, p_date_to, p_location_id)) WITH ORDINALITY AS slot(item, position)
  LEFT JOIN LATERAL public.intro_site_limits((slot.item->>'session_id')::uuid) limits ON true;
$$;

CREATE OR REPLACE FUNCTION public.enforce_intro_site_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_location_id uuid; v_limits record;
BEGIN
  IF NEW.status <> 'reserved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'reserved' AND OLD.session_id = NEW.session_id
    AND OLD.bow_usage_type IS NOT DISTINCT FROM NEW.bow_usage_type THEN RETURN NEW; END IF;

  SELECT s.location_id INTO v_location_id FROM public.sessions s WHERE s.id = NEW.session_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('intro-site:' || v_location_id::text, 0));
  IF NEW.intro_client_id IS NOT NULL AND public.intro_calendar_spots(NEW.session_id, NEW.id) <= 0 THEN
    RAISE EXCEPTION 'El turno ya no tiene cupo disponible para pruebas';
  END IF;
  IF NEW.intro_client_id IS NULL THEN
    SELECT * INTO v_limits FROM public.intro_site_limits(NEW.session_id, NEW.id);
    IF v_limits.physical_remaining = 0 THEN RAISE EXCEPTION 'El turno ya no tiene plazas disponibles'; END IF;
    IF v_limits.academy_remaining = 0 AND NEW.bow_usage_type::text IS DISTINCT FROM 'own' THEN
      RAISE EXCEPTION 'El turno ya no tiene arcos de academia disponibles';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_intro_site_limit ON public.bookings;
CREATE TRIGGER enforce_intro_site_limit BEFORE INSERT OR UPDATE OF session_id, status, bow_usage_type ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_intro_site_limit();

REVOKE ALL ON FUNCTION public.intro_site_limits(uuid, uuid), public.intro_calendar_spots(uuid, uuid),
  public.admin_get_intro_calendar_base(date, date, uuid), public.enforce_intro_site_limit(),
  public.get_multisite_session_availability_base(uuid, uuid, boolean, uuid),
  public.get_multisite_session_availability(uuid, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_multisite_session_availability(uuid, uuid, boolean, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_intro_calendar(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_intro_calendar(date, date, uuid) TO authenticated;

COMMIT;
