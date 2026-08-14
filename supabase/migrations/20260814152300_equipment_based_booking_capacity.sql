BEGIN;

INSERT INTO public.bow_inventory (
  draw_weight_lbs,
  quantity_total,
  quantity_active,
  notes
)
VALUES (
  20,
  6,
  6,
  'Arcos de academia. Los 2 arcos exclusivos para clases de prueba no forman parte de este inventario.'
)
ON CONFLICT (draw_weight_lbs) DO UPDATE
SET
  quantity_total = GREATEST(public.bow_inventory.quantity_total, 6),
  quantity_active = 6,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_session_equipment_availability(
  p_session_id uuid,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_academy_capacity integer := 0;
  v_academy_students_reserved integer := 0;
  v_intro_reserved integer := 0;
  v_intro_bows_used integer := 0;
  v_intro_academy_bows_used integer := 0;
  v_academy_bows_used integer := 0;
  v_academy_bows_remaining integer := 0;
  v_intro_spots_remaining integer := 0;
BEGIN
  SELECT COALESCE(quantity_active, 0)
  INTO v_academy_capacity
  FROM public.bow_inventory
  WHERE draw_weight_lbs = 20;

  SELECT
    COUNT(*) FILTER (
      WHERE b.student_id IS NOT NULL
        AND b.intro_client_id IS NULL
        AND b.bow_usage_type = 'shared_inventory'
    )::integer,
    COUNT(*) FILTER (WHERE b.intro_client_id IS NOT NULL)::integer
  INTO v_academy_students_reserved, v_intro_reserved
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.status = 'reserved'
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id);

  v_intro_bows_used := LEAST(v_intro_reserved, 2);
  v_intro_academy_bows_used := GREATEST(v_intro_reserved - 2, 0);
  v_academy_bows_used := v_academy_students_reserved + v_intro_academy_bows_used;
  v_academy_bows_remaining := GREATEST(v_academy_capacity - v_academy_bows_used, 0);
  v_intro_spots_remaining := GREATEST(2 - v_intro_reserved, 0) + v_academy_bows_remaining;

  RETURN jsonb_build_object(
    'academy_capacity', v_academy_capacity,
    'academy_students_reserved', v_academy_students_reserved,
    'intro_reserved', v_intro_reserved,
    'intro_bows_used', v_intro_bows_used,
    'intro_academy_bows_used', v_intro_academy_bows_used,
    'academy_bows_used', v_academy_bows_used,
    'academy_bows_remaining', v_academy_bows_remaining,
    'intro_spots_remaining', v_intro_spots_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_equipment_availability(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_equipment_availability(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_session_equipment_availability(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_equipment_availability(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_session_availability_v3(
  p_session_id uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_bow_usage_type text;
  v_equipment jsonb;
  v_remaining integer := 0;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT * INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF v_bow_usage_type IN ('own', 'assigned') THEN
    RETURN jsonb_build_object(
      'available', true,
      'message', 'Equipo disponible',
      'bow_usage_type', v_bow_usage_type,
      'spots_for_student', 1
    );
  END IF;

  v_equipment := public.get_session_equipment_availability(p_session_id);
  v_remaining := COALESCE((v_equipment->>'academy_bows_remaining')::integer, 0);

  RETURN jsonb_build_object(
    'available', v_remaining > 0,
    'message', CASE
      WHEN v_remaining > 0 THEN 'Equipo disponible'
      ELSE 'Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.'
    END,
    'bow_usage_type', v_bow_usage_type,
    'spots_for_student', v_remaining,
    'equipment', v_equipment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_session_availability_v3(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_session_availability_v3(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_session_availability_v3(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_available_intro_sessions(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  equipment_capacity integer,
  equipment_reserved integer,
  spots_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    (availability.data->>'intro_spots_remaining')::integer
  FROM public.sessions s
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(s.id) AS data
  ) availability
  WHERE s.status = 'scheduled'
    AND s.start_at > now()
    AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
    AND (availability.data->>'intro_spots_remaining')::integer > 0
  ORDER BY s.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_intro_sessions(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_available_sessions_for_student(
  p_student_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  already_reserved boolean,
  distance_m integer,
  bow_usage_type text,
  slot_capacity integer,
  distance_reserved integer,
  bow_capacity integer,
  bow_reserved integer,
  spots_for_student integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;

  IF COALESCE(v_student.operational_status, 'active') IN ('retired', 'withdrawn', 'blocked', 'suspended')
    OR (COALESCE(v_student.is_active, true) = false AND COALESCE(v_student.operational_status, 'active') <> 'paused')
  THEN
    RETURN;
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  SELECT
    s.id,
    s.start_at,
    s.end_at,
    s.status::text,
    (reservation.session_id IS NOT NULL),
    v_student.current_distance_m,
    v_bow_usage_type,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_capacity')::integer ELSE 1 END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_bows_used')::integer ELSE 0 END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_capacity')::integer ELSE NULL END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_bows_used')::integer ELSE NULL END,
    CASE
      WHEN s.status <> 'scheduled' OR s.start_at <= now() OR reservation.session_id IS NOT NULL THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned') THEN 1
      ELSE (equipment.data->>'academy_bows_remaining')::integer
    END::integer
  FROM public.sessions s
  INNER JOIN LATERAL public.select_student_membership_for_date(
    v_student_id,
    (s.start_at AT TIME ZONE 'America/Lima')::date
  ) eligible_membership ON eligible_membership.id IS NOT NULL
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(s.id) AS data
  ) equipment
  LEFT JOIN LATERAL (
    SELECT b.session_id
    FROM public.bookings b
    WHERE b.session_id = s.id
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
    LIMIT 1
  ) reservation ON true
  WHERE (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
  ORDER BY s.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_admin_available_sessions_for_student(
  p_student_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  already_reserved boolean,
  distance_m integer,
  bow_usage_type text,
  slot_capacity integer,
  distance_reserved integer,
  bow_capacity integer,
  bow_reserved integer,
  spots_for_student integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students;
  v_bow_usage_type text;
  v_from_date date;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  v_from_date := GREATEST(p_date_from, (now() AT TIME ZONE 'America/Lima')::date - 7);
  IF p_date_to < v_from_date THEN RETURN; END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id AND COALESCE(is_active, true) = true;
  IF v_student IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF v_student.current_distance_m IS NULL THEN RAISE EXCEPTION 'El alumno no tiene distancia configurada'; END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  SELECT
    s.id,
    s.start_at,
    s.end_at,
    s.status::text,
    (reservation.session_id IS NOT NULL),
    v_student.current_distance_m,
    v_bow_usage_type,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_capacity')::integer ELSE 1 END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_bows_used')::integer ELSE 0 END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_capacity')::integer ELSE NULL END,
    CASE WHEN v_bow_usage_type = 'shared_inventory' THEN (equipment.data->>'academy_bows_used')::integer ELSE NULL END,
    CASE
      WHEN reservation.session_id IS NOT NULL THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned') THEN 1
      ELSE (equipment.data->>'academy_bows_remaining')::integer
    END::integer
  FROM public.sessions s
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(s.id) AS data
  ) equipment
  LEFT JOIN LATERAL (
    SELECT b.session_id
    FROM public.bookings b
    WHERE b.session_id = s.id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
    LIMIT 1
  ) reservation ON true
  WHERE s.status = 'scheduled'
    AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_from_date AND p_date_to
  ORDER BY s.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_available_sessions_for_student(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_available_sessions_for_student(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_available_sessions_for_student(uuid, date, date) TO authenticated, service_role;

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
SET search_path = public
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
  IF p_age IS NULL OR p_age < 5 THEN RAISE EXCEPTION 'La edad del cliente no es valida'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'El turno es obligatorio'; END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN RAISE EXCEPTION 'El monto cobrado no es valido'; END IF;
  IF v_intro_class_type NOT IN ('paid', 'free', 'courtesy') THEN RAISE EXCEPTION 'Tipo de clase intro no valido'; END IF;
  IF v_payment_status NOT IN ('pending', 'paid', 'not_applicable') THEN RAISE EXCEPTION 'Estado de pago no valido'; END IF;

  IF v_intro_class_type = 'paid' AND (p_amount_paid <= 0 OR v_payment_status NOT IN ('pending', 'paid')) THEN
    RAISE EXCEPTION 'Una clase intro pagada requiere monto mayor a cero y estado pendiente o pagado';
  END IF;
  IF v_intro_class_type IN ('free', 'courtesy') AND (p_amount_paid <> 0 OR v_payment_status <> 'not_applicable') THEN
    RAISE EXCEPTION 'Una clase intro gratuita o de cortesia requiere monto cero y pago no aplica';
  END IF;
  IF v_intro_class_type = 'courtesy' AND NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de cortesia es obligatorio';
  END IF;
  IF NULLIF(btrim(p_payment_method), '') IS NULL THEN RAISE EXCEPTION 'El metodo de pago es obligatorio'; END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'Solo se pueden agendar clases de prueba en turnos programados'; END IF;
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
  )
  VALUES (
    v_intro_client_id, p_amount_paid, btrim(p_payment_method), v_intro_class_type,
    v_payment_status, NULLIF(btrim(COALESCE(p_courtesy_reason, '')), ''),
    CASE WHEN v_intro_class_type = 'courtesy' THEN v_actor_id ELSE NULL END
  )
  RETURNING id INTO v_payment_id;

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
SET search_path = public
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
  IF p_age IS NULL OR p_age < 5 OR p_age > 99 THEN RAISE EXCEPTION 'Edad no valida'; END IF;
  IF v_intro_class_type NOT IN ('paid', 'free', 'courtesy') THEN RAISE EXCEPTION 'Tipo de clase intro no valido'; END IF;
  IF v_payment_status NOT IN ('pending', 'paid', 'not_applicable') THEN RAISE EXCEPTION 'Estado de pago no valido'; END IF;
  IF v_intro_class_type = 'paid' AND (p_amount_paid <= 0 OR v_payment_status NOT IN ('pending', 'paid')) THEN
    RAISE EXCEPTION 'Una clase pagada requiere monto mayor a cero y estado pending o paid';
  END IF;
  IF v_intro_class_type IN ('free', 'courtesy') AND (p_amount_paid <> 0 OR v_payment_status <> 'not_applicable') THEN
    RAISE EXCEPTION 'Las clases gratuitas o de cortesia no deben tener pago aplicable';
  END IF;
  IF v_intro_class_type = 'courtesy' AND NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de cortesia es obligatorio';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND intro_client_id = p_intro_client_id
    AND intro_client_id IS NOT NULL
  FOR UPDATE;
  IF v_booking IS NULL THEN RAISE EXCEPTION 'Reserva de clase intro no encontrada'; END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Sesion no encontrada'; END IF;
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'La sesion seleccionada no esta disponible'; END IF;

  v_equipment := public.get_session_equipment_availability(p_session_id, p_booking_id);
  IF COALESCE((v_equipment->>'intro_spots_remaining')::integer, 0) <= 0 THEN
    RAISE EXCEPTION 'Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.';
  END IF;

  UPDATE public.intro_clients
  SET full_name = btrim(p_full_name), age = p_age, phone = NULLIF(btrim(COALESCE(p_phone, '')), '')
  WHERE id = p_intro_client_id;

  UPDATE public.bookings
  SET session_id = p_session_id, distance_m = 10, bow_usage_type = 'shared_inventory', updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.intro_payments
  SET
    amount = p_amount_paid,
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

-- Redefine the current write RPCs after legacy non-timestamped migrations.
-- Both lock the session before calling the equipment availability check.
CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_session_day_cutoff timestamptz;
  v_pending_reserved_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT * INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.operational_status, 'active') IN ('retired', 'withdrawn', 'blocked', 'suspended')
    OR (
      COALESCE(v_student.is_active, true) = false
      AND COALESCE(v_student.operational_status, 'active') <> 'paused'
    )
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  v_session_day_cutoff := public.get_booking_day_cutoff(
    (v_session.start_at AT TIME ZONE 'America/Lima')::date
  );

  IF v_session_day_cutoff IS NOT NULL AND now() >= v_session_day_cutoff THEN
    RAISE EXCEPTION 'Las reservas para este dia se cerraron 2 horas antes del primer turno';
  END IF;

  LOOP
    SELECT * INTO v_membership
    FROM public.select_student_membership_for_date(
      v_student_id,
      (v_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_membership IS NULL THEN
      RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
    END IF;

    SELECT sm.* INTO v_membership
    FROM public.student_memberships sm
    WHERE sm.id = v_membership.id
    FOR UPDATE;

    SELECT COUNT(*)::integer INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count < COALESCE(v_membership.classes_remaining, 0) THEN
      EXIT;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(p_session, v_student_id);

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (CASE
      WHEN v_bow_usage_type = 'own' THEN 'ownbow'
      WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
      ELSE NULL
    END)::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.book_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_session(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_pending_reserved_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM public.sync_student_membership_operational_status(p_student_id);

  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.operational_status, 'active') IN ('retired', 'withdrawn', 'blocked', 'suspended')
    OR (
      COALESCE(v_student.is_active, true) = false
      AND COALESCE(v_student.operational_status, 'active') <> 'paused'
    )
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  LOOP
    SELECT * INTO v_membership
    FROM public.select_student_membership_for_date(
      p_student_id,
      (v_session.start_at AT TIME ZONE 'America/Lima')::date
    );

    IF v_membership IS NULL THEN
      RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
    END IF;

    SELECT sm.* INTO v_membership
    FROM public.student_memberships sm
    WHERE sm.id = v_membership.id
    FOR UPDATE;

    SELECT COUNT(*)::integer INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count < COALESCE(v_membership.classes_remaining, 0) THEN
      EXIT;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(p_session_id, p_student_id);

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (CASE
      WHEN v_bow_usage_type = 'own' THEN 'ownbow'
      WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
      ELSE NULL
    END)::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated, service_role;

COMMIT;
