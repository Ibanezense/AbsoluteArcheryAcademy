-- ============================================================================
-- Atomic admin RPCs for intro registration and session allocation editing
-- Date: 2026-06-01
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_register_intro_class(text, integer, text, uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.admin_register_intro_class(
  p_full_name text,
  p_age integer,
  p_phone text,
  p_session_id uuid,
  p_amount_paid numeric,
  p_payment_method text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions;
  v_capacity integer := 0;
  v_booked_count integer := 0;
  v_intro_client_id uuid;
  v_booking_id uuid;
  v_payment_id uuid;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NULLIF(btrim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;

  IF p_age IS NULL OR p_age < 5 THEN
    RAISE EXCEPTION 'La edad del cliente no es valida';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'El turno es obligatorio';
  END IF;

  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'El monto cobrado no es valido';
  END IF;

  IF NULLIF(btrim(p_payment_method), '') IS NULL THEN
    RAISE EXCEPTION 'El metodo de pago es obligatorio';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Turno no encontrado';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Solo se pueden agendar clases de prueba en turnos programados';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No se puede agendar una clase de prueba en un turno pasado';
  END IF;

  SELECT COALESCE(
    MAX(
      CASE
        WHEN COALESCE(sda.slot_capacity, 0) > 0 THEN sda.slot_capacity
        WHEN COALESCE(sda.targets, 0) > 0 THEN sda.targets * 4
        ELSE 0
      END
    ),
    0
  )
  INTO v_capacity
  FROM public.session_distance_allocations sda
  WHERE sda.session_id = p_session_id
    AND sda.distance_m = 10;

  IF v_capacity <= 0 THEN
    RAISE EXCEPTION 'El turno no tiene cupos configurados para 10 m';
  END IF;

  SELECT COUNT(*)
  INTO v_booked_count
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.distance_m = 10
    AND b.status IN ('reserved', 'attended', 'no_show');

  IF v_booked_count >= v_capacity THEN
    RAISE EXCEPTION 'No hay cupos disponibles para este turno';
  END IF;

  INSERT INTO public.intro_clients (
    full_name,
    age,
    phone
  )
  VALUES (
    btrim(p_full_name),
    p_age,
    NULLIF(btrim(p_phone), '')
  )
  RETURNING id INTO v_intro_client_id;

  INSERT INTO public.bookings (
    session_id,
    intro_client_id,
    status,
    distance_m,
    bow_usage_type
  )
  VALUES (
    p_session_id,
    v_intro_client_id,
    'reserved',
    10,
    'shared_inventory'
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.intro_payments (
    intro_client_id,
    amount,
    payment_method
  )
  VALUES (
    v_intro_client_id,
    p_amount_paid,
    btrim(p_payment_method)
  )
  RETURNING id INTO v_payment_id;

  RETURN json_build_object(
    'success', true,
    'intro_client_id', v_intro_client_id,
    'booking_id', v_booking_id,
    'payment_id', v_payment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text) IS
  'Atomically registers an intro client, its booking and payment for admin users.';

DROP FUNCTION IF EXISTS public.admin_upsert_session_with_allocations(uuid, timestamptz, timestamptz, text, text, uuid, boolean, jsonb);
CREATE OR REPLACE FUNCTION public.admin_upsert_session_with_allocations(
  p_session_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_status text,
  p_notes text,
  p_weekly_template_id uuid,
  p_is_manual_override boolean,
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
      is_manual_override
    )
    VALUES (
      p_start_at,
      p_end_at,
      p_status,
      NULLIF(btrim(p_notes), ''),
      p_weekly_template_id,
      COALESCE(p_is_manual_override, true)
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
      is_manual_override = COALESCE(p_is_manual_override, true)
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

GRANT EXECUTE ON FUNCTION public.admin_upsert_session_with_allocations(uuid, timestamptz, timestamptz, text, text, uuid, boolean, jsonb) TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_session_with_allocations(uuid, timestamptz, timestamptz, text, text, uuid, boolean, jsonb) IS
  'Atomically creates or updates a session and replaces its distance allocations for admin users.';
