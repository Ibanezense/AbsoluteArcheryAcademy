-- Make the manual-session transaction explicit about the academy location.
-- Existing sessions were backfilled to Tiabaya by the multisite migration.
DROP FUNCTION IF EXISTS public.admin_upsert_session_with_allocations(uuid, timestamptz, timestamptz, text, text, uuid, boolean, jsonb);

CREATE OR REPLACE FUNCTION public.admin_upsert_session_with_allocations(
  p_session_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_status text,
  p_notes text,
  p_weekly_template_id uuid,
  p_is_manual_override boolean,
  p_location_id uuid,
  p_allocations jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_allocation_count integer := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_location_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academy_locations WHERE id = p_location_id AND is_active
  ) THEN
    RAISE EXCEPTION 'La sede seleccionada no es valida o esta inactiva';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RAISE EXCEPTION 'Inicio y fin son obligatorios';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'La hora de fin debe ser posterior a la de inicio';
  END IF;

  IF p_status NOT IN ('scheduled', 'cancelled') THEN
    RAISE EXCEPTION 'Estado de turno no valido';
  END IF;

  SELECT COUNT(*)
  INTO v_allocation_count
  FROM (
    SELECT
      COALESCE((allocation->>'targets')::integer, 0) AS targets,
      COALESCE((allocation->>'slot_capacity')::integer, 0) AS slot_capacity
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) AS allocation
  ) AS parsed_allocations
  WHERE slot_capacity > 0
    AND targets > 0;

  IF v_allocation_count = 0 THEN
    RAISE EXCEPTION 'Debe configurar al menos un cupo por distancia';
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.sessions (
      start_at,
      end_at,
      status,
      notes,
      weekly_template_id,
      is_manual_override,
      location_id
    )
    VALUES (
      p_start_at,
      p_end_at,
      p_status,
      NULLIF(btrim(p_notes), ''),
      p_weekly_template_id,
      COALESCE(p_is_manual_override, true),
      p_location_id
    )
    RETURNING id INTO v_session_id;
  ELSE
    SELECT id
    INTO v_session_id
    FROM public.sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Turno no encontrado';
    END IF;

    IF EXISTS (
      WITH requested_allocations AS (
        SELECT
          (allocation->>'distance_m')::integer AS distance_m,
          (allocation->>'slot_capacity')::integer AS slot_capacity
        FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) AS allocation
        WHERE COALESCE((allocation->>'slot_capacity')::integer, 0) > 0
          AND COALESCE((allocation->>'targets')::integer, 0) > 0
      ),
      active_booking_counts AS (
        SELECT
          b.distance_m,
          COUNT(*)::integer AS booked_count
        FROM public.bookings b
        WHERE b.session_id = p_session_id
          AND b.status IN ('reserved', 'attended', 'no_show')
          AND b.distance_m IS NOT NULL
        GROUP BY b.distance_m
      )
      SELECT 1
      FROM active_booking_counts abc
      LEFT JOIN requested_allocations ra
        ON ra.distance_m = abc.distance_m
      WHERE COALESCE(ra.slot_capacity, 0) < abc.booked_count
    ) THEN
      RAISE EXCEPTION 'No se puede reducir la capacidad por debajo de las reservas existentes';
    END IF;

    UPDATE public.sessions
    SET
      start_at = p_start_at,
      end_at = p_end_at,
      status = p_status,
      notes = NULLIF(btrim(p_notes), ''),
      weekly_template_id = p_weekly_template_id,
      is_manual_override = COALESCE(p_is_manual_override, true),
      location_id = p_location_id
    WHERE id = p_session_id
    RETURNING id INTO v_session_id;
  END IF;

  DELETE FROM public.session_distance_allocations
  WHERE session_id = v_session_id;

  INSERT INTO public.session_distance_allocations (
    session_id,
    distance_m,
    targets,
    slot_capacity
  )
  SELECT
    v_session_id,
    distance_m,
    targets,
    slot_capacity
  FROM (
    SELECT
      (allocation->>'distance_m')::integer AS distance_m,
      (allocation->>'targets')::integer AS targets,
      (allocation->>'slot_capacity')::integer AS slot_capacity
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) AS allocation
  ) AS parsed_allocations
  WHERE slot_capacity > 0
    AND targets > 0;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_session_with_allocations(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_session_with_allocations(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, jsonb) IS
  'Atomically creates or updates a session, location and distance allocations for admin users.';
