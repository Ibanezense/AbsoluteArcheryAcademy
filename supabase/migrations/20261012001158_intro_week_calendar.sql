BEGIN;

ALTER TABLE public.intro_payments ADD COLUMN IF NOT EXISTS pay_on_site boolean NOT NULL DEFAULT false;

CREATE TABLE public.intro_appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb NOT NULL,
  request_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.intro_appointment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY intro_events_admin_read ON public.intro_appointment_events FOR SELECT TO authenticated
  USING (public.is_admin_user());
GRANT SELECT ON public.intro_appointment_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.intro_appointment_events FROM authenticated, anon;

-- Keep the regular-student attendance policy; trial appointments retain No show.
DROP TRIGGER IF EXISTS reject_new_booking_no_show ON public.bookings;
CREATE TRIGGER reject_new_booking_no_show BEFORE INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW WHEN (NEW.intro_client_id IS NULL) EXECUTE FUNCTION public.reject_new_no_show();

CREATE OR REPLACE FUNCTION public.intro_calendar_spots(p_session_id uuid, p_exclude_booking_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT GREATEST(0, LEAST(
    COALESCE((public.get_session_equipment_availability(p_session_id, p_exclude_booking_id)->>'intro_spots_remaining')::integer, 0),
    COALESCE((public.get_multisite_session_availability(p_session_id, NULL, true, p_exclude_booking_id)->>'physical_spots_remaining')::integer, 0)
  ));
$$;
REVOKE ALL ON FUNCTION public.intro_calendar_spots(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_intro_calendar(p_date_from date, p_date_to date, p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores pueden consultar las citas'; END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to < p_date_from OR p_date_to - p_date_from > 62 THEN
    RAISE EXCEPTION 'Selecciona un intervalo válido de hasta 63 días';
  END IF;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY start_at, location_name), '[]'::jsonb) INTO v_result
  FROM (
    SELECT s.start_at, l.name AS location_name, jsonb_build_object(
      'session_id', s.id, 'start_at', s.start_at, 'end_at', s.end_at,
      'location_id', l.id, 'location_code', l.code, 'location_name', l.name, 'location_address', l.address,
      'capacity', COALESCE((a.data->>'physical_capacity')::integer, 0),
      'booked_total', GREATEST(0, COALESCE((a.data->>'physical_capacity')::integer, 0) - COALESCE((a.data->>'physical_spots_remaining')::integer, 0)),
      'available', public.intro_calendar_spots(s.id),
      'accepts_intro', public.session_accepts_intro(s.id),
      'can_book', public.session_accepts_intro(s.id) AND s.start_at > now() AND public.intro_calendar_spots(s.id) > 0,
      'clients', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'booking_id', b.id, 'intro_client_id', c.id, 'full_name', c.full_name, 'age', c.age, 'phone', c.phone,
          'booking_status', b.status, 'updated_at', b.updated_at,
          'intro_class_type', COALESCE(p.intro_class_type, 'free'),
          'payment_status', COALESCE(p.payment_status, 'not_applicable'),
          'amount_paid', p.amount, 'payment_method', p.payment_method, 'paid_at', p.paid_at,
          'courtesy_reason', p.courtesy_reason, 'pay_on_site', COALESCE(p.pay_on_site, false)
        ) ORDER BY b.created_at)
        FROM public.bookings b JOIN public.intro_clients c ON c.id=b.intro_client_id
        LEFT JOIN LATERAL (
          SELECT ip.* FROM public.intro_payments ip WHERE ip.intro_client_id=c.id
          ORDER BY ip.paid_at DESC NULLS LAST, ip.id LIMIT 1
        ) p ON true WHERE b.session_id=s.id
      ), '[]'::jsonb)
    ) AS row_data
    FROM public.sessions s JOIN public.academy_locations l ON l.id=s.location_id
    CROSS JOIN LATERAL (SELECT public.get_multisite_session_availability(s.id, NULL, true, NULL) AS data) a
    WHERE s.start_at >= (p_date_from::timestamp AT TIME ZONE 'America/Lima')
      AND s.start_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'America/Lima')
      AND (p_location_id IS NULL OR s.location_id=p_location_id)
      AND (public.session_accepts_intro(s.id) OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.session_id=s.id AND b.intro_client_id IS NOT NULL))
  ) calendar_rows;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_intro_calendar(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_intro_calendar(date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_register_intro_appointment(
  p_full_name text, p_age integer, p_phone text, p_session_id uuid, p_amount_paid numeric,
  p_payment_method text, p_intro_class_type text, p_payment_status text,
  p_courtesy_reason text, p_pay_on_site boolean, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_existing public.intro_appointment_events;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores pueden agendar citas'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Falta la identificación de la solicitud'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO v_existing FROM public.intro_appointment_events WHERE request_id=p_request_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.actor_id <> auth.uid() OR v_existing.action <> 'create' THEN RAISE EXCEPTION 'Solicitud incompatible'; END IF;
    RETURN v_existing.after_data;
  END IF;
  IF p_age IS NULL OR p_age < 5 OR p_age > 99 THEN RAISE EXCEPTION 'Edad no válida'; END IF;
  PERFORM 1 FROM public.sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT public.session_accepts_intro(p_session_id) OR public.intro_calendar_spots(p_session_id) <= 0 THEN RAISE EXCEPTION 'El turno no tiene cupo disponible para pruebas'; END IF;
  IF p_payment_status='paid' AND NULLIF(btrim(p_payment_method), '') IS NULL THEN RAISE EXCEPTION 'Indica el método de pago'; END IF;
  IF p_payment_status='paid' AND p_payment_method='not_applicable' THEN RAISE EXCEPTION 'Indica el método de pago'; END IF;
  v_result := public.admin_register_intro_class(p_full_name, p_age, p_phone, p_session_id, p_amount_paid,
    CASE WHEN p_payment_status='paid' THEN p_payment_method ELSE 'not_applicable' END,
    p_intro_class_type, p_payment_status, p_courtesy_reason)::jsonb;
  UPDATE public.intro_payments SET pay_on_site=COALESCE(p_pay_on_site, false) AND p_payment_status='pending',
    paid_at=CASE WHEN p_payment_status='paid' THEN now() ELSE NULL END
    WHERE id=(v_result->>'payment_id')::uuid;
  INSERT INTO public.intro_appointment_events(booking_id, actor_id, action, after_data, request_id)
  VALUES ((v_result->>'booking_id')::uuid, auth.uid(), 'create', v_result, p_request_id);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_register_intro_appointment(text, integer, text, uuid, numeric, text, text, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_intro_appointment(text, integer, text, uuid, numeric, text, text, text, text, boolean, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_change_intro_appointment(
  p_booking_id uuid, p_expected_updated_at timestamptz, p_action text,
  p_session_id uuid DEFAULT NULL, p_state text DEFAULT NULL, p_details jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_booking public.bookings; v_session public.sessions; v_payment public.intro_payments;
  v_before jsonb; v_after jsonb; v_target uuid; v_status public.booking_status;
  v_type text; v_payment_status text; v_amount numeric; v_method text; v_reason text; v_site boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores pueden modificar citas'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking_id AND intro_client_id IS NOT NULL FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Cita de prueba no encontrada'; END IF;
  IF v_booking.student_id IS NOT NULL OR v_booking.active_membership_id IS NOT NULL THEN RAISE EXCEPTION 'Esta operación es exclusiva para clases de prueba'; END IF;
  IF p_expected_updated_at IS NULL OR v_booking.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'La cita cambió. Actualiza el calendario.'; END IF;
  IF p_action NOT IN ('move', 'state', 'edit') OR p_action IS NULL THEN RAISE EXCEPTION 'Acción no válida'; END IF;
  SELECT * INTO v_payment FROM public.intro_payments WHERE intro_client_id=v_booking.intro_client_id ORDER BY paid_at DESC NULLS LAST, id LIMIT 1 FOR UPDATE;
  v_before := jsonb_build_object('booking', to_jsonb(v_booking), 'payment', to_jsonb(v_payment),
    'client', (SELECT to_jsonb(c) FROM public.intro_clients c WHERE c.id=v_booking.intro_client_id));
  v_target := COALESCE(p_session_id, v_booking.session_id);
  v_status := v_booking.status;
  v_type := COALESCE(v_payment.intro_class_type, 'free');
  v_payment_status := COALESCE(v_payment.payment_status, 'not_applicable');
  v_amount := COALESCE(v_payment.amount, 0); v_method := COALESCE(v_payment.payment_method, 'not_applicable');
  v_reason := v_payment.courtesy_reason; v_site := COALESCE(v_payment.pay_on_site, false);

  IF p_action='edit' THEN
    IF p_details IS NULL OR NULLIF(btrim(p_details->>'fullName'),'') IS NULL THEN RAISE EXCEPTION 'El nombre es obligatorio'; END IF;
    IF (p_details->>'age')::integer IS NULL OR (p_details->>'age')::integer NOT BETWEEN 5 AND 99 THEN RAISE EXCEPTION 'Edad no válida'; END IF;
    v_type := p_details->>'introClassType'; v_payment_status := p_details->>'paymentStatus';
    v_amount := (p_details->>'amountPaid')::numeric;
    v_method := COALESCE(NULLIF(p_details->>'paymentMethod',''), 'not_applicable');
    v_reason := NULLIF(btrim(p_details->>'courtesyReason'), ''); v_site := COALESCE((p_details->>'payOnSite')::boolean, false);
  END IF;
  IF p_action='state' OR (p_action='edit' AND p_state IS NOT NULL) THEN
    IF p_state IS NULL OR p_state NOT IN ('reserved','pending','paid','attended','no_show','cancelled') THEN RAISE EXCEPTION 'Estado no válido'; END IF;
    IF p_state IN ('attended','no_show','cancelled') THEN v_status := p_state::public.booking_status;
    ELSE
      v_status := 'reserved';
      IF p_state='reserved' AND v_type='paid' THEN RAISE EXCEPTION 'Para reservar sin cobro, edita el tipo de clase'; END IF;
      IF p_state IN ('pending','paid') AND v_type<>'paid' THEN RAISE EXCEPTION 'Primero indica el tipo de clase y el importe'; END IF;
      v_payment_status := CASE WHEN p_state='pending' THEN 'pending' WHEN p_state='paid' THEN 'paid' ELSE 'not_applicable' END;
      IF p_state='paid' THEN v_method := COALESCE(NULLIF(p_details->>'paymentMethod',''), v_method); v_site := false; END IF;
    END IF;
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('paid','free','courtesy') OR v_payment_status IS NULL OR v_payment_status NOT IN ('paid','pending','not_applicable') THEN RAISE EXCEPTION 'Tipo de clase o pago no válido'; END IF;
  IF v_amount IS NULL OR v_amount < 0 OR (v_type='paid' AND (v_amount<=0 OR v_payment_status NOT IN ('paid','pending')))
    OR (v_type<>'paid' AND (v_amount<>0 OR v_payment_status<>'not_applicable')) THEN RAISE EXCEPTION 'El importe y estado de pago no son compatibles'; END IF;
  IF v_type='courtesy' AND v_reason IS NULL THEN RAISE EXCEPTION 'Indica el motivo de cortesía'; END IF;
  IF v_payment_status='paid' AND v_method='not_applicable' THEN RAISE EXCEPTION 'Indica el método de pago recibido'; END IF;
  -- Changing status alone must not modify a previously received payment method.
  IF v_payment_status<>'paid' AND p_action='edit' THEN v_method := 'not_applicable'; END IF;

  PERFORM 1 FROM public.sessions WHERE id IN (v_booking.session_id, v_target) ORDER BY id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions WHERE id=v_target;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF v_target <> v_booking.session_id THEN
    IF v_status <> 'reserved' OR (v_booking.status <> 'reserved' AND (p_state IS NULL OR p_state NOT IN ('reserved','pending','paid'))) THEN RAISE EXCEPTION 'Reactiva la cita antes de reprogramarla'; END IF;
    IF v_session.start_at<=now() OR NOT public.session_accepts_intro(v_target) THEN RAISE EXCEPTION 'El destino no admite nuevas citas'; END IF;
  END IF;
  IF v_status='reserved' AND (v_target<>v_booking.session_id OR v_booking.status<>'reserved') THEN
    IF v_session.start_at<=now() OR NOT public.session_accepts_intro(v_target) THEN RAISE EXCEPTION 'Selecciona un turno futuro disponible para reactivar'; END IF;
    IF public.intro_calendar_spots(v_target, p_booking_id)<=0 THEN RAISE EXCEPTION 'El turno ya no tiene cupo disponible'; END IF;
  END IF;
  IF p_state IS NOT NULL AND v_status IN ('attended','no_show') THEN
    IF v_booking.status='cancelled' THEN RAISE EXCEPTION 'Reactiva la cita antes de registrar asistencia'; END IF;
    IF v_session.start_at>now() THEN RAISE EXCEPTION 'La clase todavía no ha comenzado'; END IF;
  END IF;
  IF p_action='edit' THEN
    UPDATE public.intro_clients SET full_name=btrim(p_details->>'fullName'), age=(p_details->>'age')::integer,
      phone=NULLIF(btrim(p_details->>'phone'),'') WHERE id=v_booking.intro_client_id;
  END IF;
  IF v_payment.id IS NOT NULL AND (p_action='edit' OR (p_action='state' AND p_state IN ('pending','paid','reserved'))) THEN
    UPDATE public.intro_payments SET amount=v_amount, intro_class_type=v_type, payment_status=v_payment_status,
      payment_method=v_method, pay_on_site=v_site AND v_payment_status='pending', courtesy_reason=v_reason,
      paid_at=CASE WHEN v_payment_status='paid' THEN COALESCE(paid_at, now()) ELSE NULL END,
      courtesy_authorized_by_profile_id=CASE WHEN v_type='courtesy' THEN auth.uid() ELSE NULL END
    WHERE id=v_payment.id;
  ELSIF p_action='edit' THEN
    INSERT INTO public.intro_payments(intro_client_id, amount, intro_class_type, payment_status, payment_method, pay_on_site, courtesy_reason, paid_at, courtesy_authorized_by_profile_id)
    VALUES (v_booking.intro_client_id, v_amount, v_type, v_payment_status, v_method, v_site AND v_payment_status='pending', v_reason,
      CASE WHEN v_payment_status='paid' THEN now() ELSE NULL END, CASE WHEN v_type='courtesy' THEN auth.uid() ELSE NULL END);
  END IF;
  UPDATE public.bookings SET session_id=v_target, status=v_status, updated_at=clock_timestamp(),
    manually_rescheduled=manually_rescheduled OR v_target<>v_booking.session_id,
    cancelled_at=CASE WHEN v_status='cancelled' THEN COALESCE(cancelled_at, now()) ELSE NULL END,
    cancelled_by_profile_id=CASE WHEN v_status='cancelled' THEN COALESCE(cancelled_by_profile_id, auth.uid()) ELSE NULL END,
    cancelled_by_role=CASE WHEN v_status='cancelled' THEN COALESCE(cancelled_by_role, 'admin') ELSE NULL END,
    attendance_marked_at=CASE WHEN v_status=v_booking.status THEN attendance_marked_at WHEN v_status IN ('attended','no_show') THEN now() ELSE NULL END,
    attendance_marked_by=CASE WHEN v_status=v_booking.status THEN attendance_marked_by WHEN v_status IN ('attended','no_show') THEN auth.uid() ELSE NULL END
  WHERE id=p_booking_id;
  v_after := jsonb_build_object('booking', (SELECT to_jsonb(b) FROM public.bookings b WHERE b.id=p_booking_id),
    'payment', (SELECT to_jsonb(p) FROM public.intro_payments p WHERE p.intro_client_id=v_booking.intro_client_id ORDER BY p.paid_at DESC NULLS LAST, p.id LIMIT 1),
    'client', (SELECT to_jsonb(c) FROM public.intro_clients c WHERE c.id=v_booking.intro_client_id));
  INSERT INTO public.intro_appointment_events(booking_id, actor_id, action, before_data, after_data)
  VALUES (p_booking_id, auth.uid(), p_action, v_before, v_after);
  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_change_intro_appointment(uuid, timestamptz, text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_change_intro_appointment(uuid, timestamptz, text, uuid, text, jsonb) TO authenticated;

COMMIT;
