BEGIN;

CREATE OR REPLACE FUNCTION public.admin_register_intro_appointment_with_dni(
  p_full_name text, p_age integer, p_phone text, p_session_id uuid, p_amount_paid numeric,
  p_payment_method text, p_intro_class_type text, p_payment_status text, p_courtesy_reason text,
  p_pay_on_site boolean, p_request_id uuid, p_dni text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_already_saved boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  IF p_dni IS NULL OR p_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'El DNI debe tener ocho dígitos'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Falta la identificación de la solicitud'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT EXISTS (SELECT 1 FROM public.intro_appointment_events WHERE request_id = p_request_id) INTO v_already_saved;
  v_result := public.admin_register_intro_appointment(
    p_full_name, p_age, p_phone, p_session_id, p_amount_paid, p_payment_method,
    p_intro_class_type, p_payment_status, p_courtesy_reason, p_pay_on_site, p_request_id
  );
  IF NOT v_already_saved THEN
    UPDATE public.intro_clients SET dni = p_dni WHERE id = (v_result->>'intro_client_id')::uuid;
  END IF;
  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_change_intro_appointment_with_dni(
  p_booking_id uuid, p_expected_updated_at timestamptz, p_action text,
  p_session_id uuid DEFAULT NULL, p_state text DEFAULT NULL, p_details jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_dni text := nullif(btrim(p_details->>'dni'), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  IF p_action IS DISTINCT FROM 'edit' OR NOT coalesce(p_details ? 'dni', false) THEN RAISE EXCEPTION 'Falta el cambio de DNI'; END IF;
  IF v_dni IS NOT NULL AND v_dni !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'El DNI debe tener ocho dígitos'; END IF;
  v_result := public.admin_change_intro_appointment(p_booking_id, p_expected_updated_at, p_action, p_session_id, p_state, p_details);
  UPDATE public.intro_clients SET dni = v_dni WHERE id = (SELECT intro_client_id FROM public.bookings WHERE id = p_booking_id);
  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.admin_register_intro_appointment_with_dni(text, integer, text, uuid, numeric, text, text, text, text, boolean, uuid, text),
  public.admin_change_intro_appointment_with_dni(uuid, timestamptz, text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_intro_appointment_with_dni(text, integer, text, uuid, numeric, text, text, text, text, boolean, uuid, text),
  public.admin_change_intro_appointment_with_dni(uuid, timestamptz, text, uuid, text, jsonb) TO authenticated;

COMMIT;
