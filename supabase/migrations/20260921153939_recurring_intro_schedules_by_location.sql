BEGIN;

ALTER TABLE public.weekly_session_templates
  ADD COLUMN IF NOT EXISTS allows_intro boolean NOT NULL DEFAULT false;

-- Preserve the current Tiabaya weekend trial flow and enable the six active
-- phase-one Umacollo occurrences. Inactive Tuesday templates remain opt-in.
UPDATE public.weekly_session_templates template
SET allows_intro = true,
    updated_at = now()
FROM public.academy_locations location
WHERE location.id = template.location_id
  AND location.code = 'tiabaya'
  AND template.weekday IN (6, 7)
  AND template.is_active = true;

UPDATE public.weekly_session_templates template
SET allows_intro = true,
    updated_at = now()
FROM public.academy_locations location
WHERE location.id = template.location_id
  AND location.code = 'umacollo'
  AND template.weekday IN (3, 4, 5)
  AND template.is_active = true;

UPDATE public.weekly_session_templates template
SET allows_intro = false,
    updated_at = now()
FROM public.academy_locations location
WHERE location.id = template.location_id
  AND location.code = 'umacollo'
  AND template.weekday = 2;

ALTER TABLE public.weekly_session_templates
  ALTER COLUMN location_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_upsert_weekly_template(
  p_template_id uuid,
  p_location_id uuid,
  p_label text,
  p_weekday smallint,
  p_start_time time,
  p_end_time time,
  p_is_active boolean,
  p_allows_intro boolean,
  p_distances jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_location public.academy_locations;
  v_location_code text;
  v_template_id uuid;
  v_distance_count integer;
  v_physical_capacity integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden guardar plantillas semanales';
  END IF;

  SELECT * INTO v_location
  FROM public.academy_locations
  WHERE id = p_location_id
  FOR SHARE;

  IF v_location.id IS NULL THEN
    RAISE EXCEPTION 'Sede no encontrada';
  END IF;
  v_location_code := v_location.code;

  IF NULLIF(btrim(COALESCE(p_label, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del horario es obligatorio';
  END IF;
  IF p_weekday IS NULL OR p_weekday NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'El día debe estar entre lunes y domingo';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora inicial';
  END IF;
  IF jsonb_typeof(COALESCE(p_distances, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Las distancias deben enviarse como una lista';
  END IF;

  SELECT
    count(*),
    COALESCE(sum((entry->>'slot_capacity')::integer), 0)
  INTO v_distance_count, v_physical_capacity
  FROM jsonb_array_elements(COALESCE(p_distances, '[]'::jsonb)) entry
  WHERE COALESCE((entry->>'distance_m')::integer, 0) > 0
    AND COALESCE((entry->>'slot_capacity')::integer, 0) > 0;

  IF v_distance_count = 0 THEN
    RAISE EXCEPTION 'Debe configurar al menos una distancia con cupos';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.weekly_session_templates (
      label, weekday, start_time, end_time, is_active, allows_intro,
      created_by, location_id, physical_capacity, regular_capacity,
      regular_distance_m, slots_per_target, booking_mode
    ) VALUES (
      btrim(p_label), p_weekday, p_start_time, p_end_time,
      COALESCE(p_is_active, true), COALESCE(p_allows_intro, false),
      v_actor_id, p_location_id,
      CASE WHEN v_location_code = 'umacollo' THEN 4 ELSE v_physical_capacity END,
      CASE WHEN v_location_code = 'umacollo' THEN 2 ELSE NULL END,
      CASE WHEN v_location_code = 'umacollo' THEN 10 ELSE NULL END,
      CASE WHEN v_location_code = 'umacollo' THEN 2 ELSE 4 END,
      CASE WHEN v_location_code = 'umacollo' THEN 'fixed' ELSE 'flexible' END
    )
    RETURNING id INTO v_template_id;

    INSERT INTO public.weekly_template_equipment_allocations (
      weekly_template_id, draw_weight_lbs, quantity, priority_for_intro
    ) VALUES
      (v_template_id, 18, 2, true),
      (v_template_id, 20, CASE WHEN v_location_code = 'umacollo' THEN 2 ELSE 6 END, false)
    ON CONFLICT (weekly_template_id, draw_weight_lbs) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      priority_for_intro = EXCLUDED.priority_for_intro;
  ELSE
    SELECT id INTO v_template_id
    FROM public.weekly_session_templates
    WHERE id = p_template_id
    FOR UPDATE;

    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'Plantilla semanal no encontrada';
    END IF;

    UPDATE public.weekly_session_templates
    SET location_id = p_location_id,
        label = btrim(p_label),
        weekday = p_weekday,
        start_time = p_start_time,
        end_time = p_end_time,
        is_active = COALESCE(p_is_active, true),
        allows_intro = COALESCE(p_allows_intro, false),
        booking_mode = CASE WHEN v_location_code = 'umacollo' THEN 'fixed' ELSE 'flexible' END,
        updated_at = now()
    WHERE id = v_template_id;
  END IF;

  DELETE FROM public.weekly_session_template_distances
  WHERE weekly_template_id = v_template_id;

  INSERT INTO public.weekly_session_template_distances (
    weekly_template_id, distance_m, slot_capacity, targets
  )
  SELECT
    v_template_id,
    (entry->>'distance_m')::integer,
    (entry->>'slot_capacity')::integer,
    COALESCE(
      NULLIF((entry->>'targets')::integer, 0),
      CEIL(
        (entry->>'slot_capacity')::numeric
        / CASE WHEN v_location_code = 'umacollo' THEN 2.0 ELSE 4.0 END
      )::integer
    )
  FROM jsonb_array_elements(p_distances) entry
  WHERE COALESCE((entry->>'distance_m')::integer, 0) > 0
    AND COALESCE((entry->>'slot_capacity')::integer, 0) > 0;

  RETURN v_template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_weekly_template(uuid, uuid, text, smallint, time without time zone, time without time zone, boolean, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_weekly_template(uuid, uuid, text, smallint, time without time zone, time without time zone, boolean, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_weekly_template(uuid, uuid, text, smallint, time without time zone, time without time zone, boolean, boolean, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.session_accepts_intro(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessions session
    JOIN public.academy_locations location ON location.id = session.location_id
    JOIN public.weekly_session_templates template ON template.id = session.weekly_template_id
    WHERE session.id = p_session_id
      AND session.status = 'scheduled'
      AND location.is_active = true
      AND (location.opens_on IS NULL OR (session.start_at AT TIME ZONE location.timezone)::date >= location.opens_on)
      AND template.is_active = true
      AND template.allows_intro = true
  );
$$;

REVOKE ALL ON FUNCTION public.session_accepts_intro(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.session_accepts_intro(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_accepts_intro(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_available_intro_sessions(date, date);
DROP FUNCTION IF EXISTS public.get_available_intro_sessions(date, date, uuid);
CREATE FUNCTION public.get_available_intro_sessions(
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
    (availability.data->>'intro_spots_remaining')::integer,
    location.code,
    location.name,
    location.address,
    location.id
  FROM public.sessions session
  JOIN public.academy_locations location ON location.id = session.location_id
  JOIN public.weekly_session_templates template ON template.id = session.weekly_template_id
  CROSS JOIN LATERAL (
    SELECT public.get_multisite_session_availability(session.id, NULL, true, NULL) AS data
  ) availability
  WHERE session.status = 'scheduled'
    AND session.start_at > now()
    AND location.is_active = true
    AND template.is_active = true
    AND template.allows_intro = true
    AND (p_location_id IS NULL OR session.location_id = p_location_id)
    AND (location.opens_on IS NULL OR (session.start_at AT TIME ZONE location.timezone)::date >= location.opens_on)
    AND (session.start_at AT TIME ZONE location.timezone)::date BETWEEN p_date_from AND p_date_to
    AND COALESCE((availability.data->>'available')::boolean, false)
    AND COALESCE((availability.data->>'intro_spots_remaining')::integer, 0) > 0
  ORDER BY session.start_at, location.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_intro_sessions(date, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_register_intro_class(
  p_full_name text,
  p_age integer,
  p_phone text,
  p_session_id uuid,
  p_amount_paid numeric,
  p_payment_method text,
  p_intro_class_type text DEFAULT 'paid',
  p_payment_status text DEFAULT NULL,
  p_courtesy_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.sessions;
  v_equipment jsonb;
  v_intro_client_id uuid;
  v_booking_id uuid;
  v_payment_id uuid;
  v_actor_id uuid := auth.uid();
  v_intro_class_type text;
  v_payment_status text;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_intro_class_type := COALESCE(NULLIF(btrim(p_intro_class_type), ''), 'paid');
  v_payment_status := COALESCE(
    NULLIF(btrim(p_payment_status), ''),
    CASE WHEN v_intro_class_type = 'paid' THEN 'paid' ELSE 'not_applicable' END
  );

  IF NULLIF(btrim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del cliente es obligatorio'; END IF;
  IF p_age IS NULL OR p_age < 5 THEN RAISE EXCEPTION 'La edad del cliente no es válida'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'El turno es obligatorio'; END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN RAISE EXCEPTION 'El monto cobrado no es válido'; END IF;
  IF v_intro_class_type NOT IN ('paid', 'free', 'courtesy') THEN RAISE EXCEPTION 'Tipo de clase intro no válido'; END IF;
  IF v_payment_status NOT IN ('pending', 'paid', 'not_applicable') THEN RAISE EXCEPTION 'Estado de pago no válido'; END IF;
  IF v_intro_class_type = 'paid' AND (p_amount_paid <= 0 OR v_payment_status NOT IN ('pending', 'paid')) THEN
    RAISE EXCEPTION 'Una clase intro pagada requiere monto mayor a cero y estado pendiente o pagado';
  END IF;
  IF v_intro_class_type IN ('free', 'courtesy') AND (p_amount_paid <> 0 OR v_payment_status <> 'not_applicable') THEN
    RAISE EXCEPTION 'Una clase intro gratuita o de cortesía requiere monto cero y pago no aplica';
  END IF;
  IF v_intro_class_type = 'courtesy' AND NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de cortesía es obligatorio';
  END IF;
  IF NULLIF(btrim(p_payment_method), '') IS NULL THEN RAISE EXCEPTION 'El método de pago es obligatorio'; END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF NOT public.session_accepts_intro(p_session_id) THEN
    RAISE EXCEPTION 'El turno seleccionado no acepta nuevas clases de prueba';
  END IF;
  IF v_session.start_at <= now() THEN RAISE EXCEPTION 'No se puede agendar una clase de prueba en un turno pasado'; END IF;

  v_equipment := public.get_session_equipment_availability(p_session_id);
  IF COALESCE((v_equipment->>'intro_spots_remaining')::integer, 0) <= 0 THEN
    RAISE EXCEPTION 'Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.';
  END IF;

  INSERT INTO public.intro_clients (full_name, age, phone)
  VALUES (btrim(p_full_name), p_age, NULLIF(btrim(p_phone), ''))
  RETURNING id INTO v_intro_client_id;

  INSERT INTO public.bookings (session_id, intro_client_id, status, distance_m, bow_usage_type)
  VALUES (p_session_id, v_intro_client_id, 'reserved', 10, 'shared_inventory')
  RETURNING id INTO v_booking_id;

  INSERT INTO public.intro_payments (
    intro_client_id, amount, payment_method, intro_class_type, payment_status,
    courtesy_reason, courtesy_authorized_by_profile_id
  ) VALUES (
    v_intro_client_id, p_amount_paid, btrim(p_payment_method), v_intro_class_type,
    v_payment_status, NULLIF(btrim(COALESCE(p_courtesy_reason, '')), ''),
    CASE WHEN v_intro_class_type = 'courtesy' THEN v_actor_id ELSE NULL END
  ) RETURNING id INTO v_payment_id;

  RETURN json_build_object(
    'success', true,
    'intro_client_id', v_intro_client_id,
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'intro_class_type', v_intro_class_type,
    'payment_status', v_payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_register_intro_class(text, integer, text, uuid, numeric, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_intro_class(
  p_booking_id uuid,
  p_intro_client_id uuid,
  p_full_name text,
  p_age integer,
  p_phone text,
  p_session_id uuid,
  p_amount_paid numeric,
  p_payment_method text,
  p_intro_class_type text,
  p_payment_status text,
  p_courtesy_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
  v_equipment jsonb;
  v_intro_class_type text;
  v_payment_status text;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores pueden editar clases intro'; END IF;

  v_intro_class_type := COALESCE(NULLIF(btrim(p_intro_class_type), ''), 'paid');
  v_payment_status := COALESCE(
    NULLIF(btrim(p_payment_status), ''),
    CASE WHEN v_intro_class_type = 'paid' THEN 'paid' ELSE 'not_applicable' END
  );

  IF NULLIF(btrim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre es obligatorio'; END IF;
  IF p_age IS NULL OR p_age < 5 OR p_age > 99 THEN RAISE EXCEPTION 'Edad no válida'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'El turno es obligatorio'; END IF;
  IF v_intro_class_type NOT IN ('paid', 'free', 'courtesy') THEN RAISE EXCEPTION 'Tipo de clase intro no válido'; END IF;
  IF v_payment_status NOT IN ('pending', 'paid', 'not_applicable') THEN RAISE EXCEPTION 'Estado de pago no válido'; END IF;
  IF v_intro_class_type = 'paid' AND (p_amount_paid <= 0 OR v_payment_status NOT IN ('pending', 'paid')) THEN
    RAISE EXCEPTION 'Una clase pagada requiere monto mayor a cero y estado pending o paid';
  END IF;
  IF v_intro_class_type IN ('free', 'courtesy') AND (p_amount_paid <> 0 OR v_payment_status <> 'not_applicable') THEN
    RAISE EXCEPTION 'Las clases gratuitas o de cortesía no deben tener pago aplicable';
  END IF;
  IF v_intro_class_type = 'courtesy' AND NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de cortesía es obligatorio';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND intro_client_id = p_intro_client_id
    AND intro_client_id IS NOT NULL
  FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Reserva de clase intro no encontrada'; END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'La sesión seleccionada no está disponible'; END IF;
  IF p_session_id <> v_booking.session_id AND NOT public.session_accepts_intro(p_session_id) THEN
    RAISE EXCEPTION 'El nuevo turno seleccionado no acepta clases de prueba';
  END IF;

  v_equipment := public.get_session_equipment_availability(p_session_id, p_booking_id);
  IF COALESCE((v_equipment->>'intro_spots_remaining')::integer, 0) <= 0 THEN
    RAISE EXCEPTION 'Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.';
  END IF;

  UPDATE public.intro_clients
  SET full_name = btrim(p_full_name),
      age = p_age,
      phone = NULLIF(btrim(COALESCE(p_phone, '')), '')
  WHERE id = p_intro_client_id;

  UPDATE public.bookings
  SET session_id = p_session_id,
      distance_m = 10,
      bow_usage_type = 'shared_inventory',
      updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.intro_payments
  SET amount = p_amount_paid,
      payment_method = COALESCE(NULLIF(btrim(p_payment_method), ''), 'not_applicable'),
      paid_at = CASE WHEN v_payment_status = 'paid' THEN COALESCE(paid_at, now()) ELSE NULL END,
      intro_class_type = v_intro_class_type,
      payment_status = v_payment_status,
      courtesy_reason = CASE WHEN v_intro_class_type = 'courtesy' THEN NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') ELSE NULL END,
      courtesy_authorized_by_profile_id = CASE WHEN v_intro_class_type = 'courtesy' THEN v_actor_id ELSE NULL END
  WHERE intro_client_id = p_intro_client_id;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'intro_client_id', p_intro_client_id,
    'session_id', p_session_id,
    'intro_class_type', v_intro_class_type,
    'payment_status', v_payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_intro_class(uuid, uuid, text, integer, text, uuid, numeric, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_intro_class(uuid, uuid, text, integer, text, uuid, numeric, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_intro_class(uuid, uuid, text, integer, text, uuid, numeric, text, text, text, text) TO authenticated, service_role;

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
  intro_bows_used integer
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
  v_saturday date := date_trunc('week', v_reference_date)::date + 5;
  v_sunday date := v_saturday + 1;
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
    (availability.data->>'intro_bows_used')::integer
  FROM public.sessions session
  JOIN public.weekly_session_templates template ON template.id = session.weekly_template_id
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(session.id) AS data
  ) availability
  WHERE session.status = 'scheduled'
    AND template.is_active = true
    AND template.allows_intro = true
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_saturday AND v_sunday
  ORDER BY session.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_weekend_intro_capacity(date) TO authenticated, service_role;

COMMIT;
