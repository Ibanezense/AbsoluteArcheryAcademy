-- ============================================================================
-- ADMIN UPDATE INTRO CLASS
-- Fecha: 2026-06-08
-- Proposito:
-- 1. Permitir al admin editar datos completos de una clase de prueba
-- 2. Actualizar prospecto, pago y horario en una sola operacion atomica
-- 3. Mantener las escrituras sensibles dentro de RPCs SECURITY DEFINER
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_update_intro_class(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  numeric,
  text,
  text,
  text,
  text
);

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
  v_actor_id uuid;
  v_booking public.bookings;
  v_session public.sessions;
  v_capacity integer;
  v_reserved integer;
  v_intro_class_type text;
  v_payment_status text;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden editar clases intro';
  END IF;

  v_intro_class_type := COALESCE(NULLIF(btrim(p_intro_class_type), ''), 'paid');
  v_payment_status := COALESCE(
    NULLIF(btrim(p_payment_status), ''),
    CASE WHEN v_intro_class_type = 'paid' THEN 'paid' ELSE 'not_applicable' END
  );

  IF NULLIF(btrim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  IF p_age IS NULL OR p_age < 5 OR p_age > 99 THEN
    RAISE EXCEPTION 'Edad no valida';
  END IF;

  IF v_intro_class_type NOT IN ('paid', 'free', 'courtesy') THEN
    RAISE EXCEPTION 'Tipo de clase intro no valido';
  END IF;

  IF v_payment_status NOT IN ('pending', 'paid', 'not_applicable') THEN
    RAISE EXCEPTION 'Estado de pago no valido';
  END IF;

  -- paid intro payment_status IN ('pending', 'paid')
  IF v_intro_class_type = 'paid'
    AND (p_amount_paid <= 0 OR v_payment_status NOT IN ('pending', 'paid'))
  THEN
    RAISE EXCEPTION 'Una clase pagada requiere monto mayor a cero y estado pending o paid';
  END IF;

  IF v_intro_class_type IN ('free', 'courtesy')
    AND (p_amount_paid <> 0 OR v_payment_status <> 'not_applicable')
  THEN
    RAISE EXCEPTION 'Las clases gratuitas o de cortesia no deben tener pago aplicable';
  END IF;

  IF v_intro_class_type = 'courtesy'
    AND NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'El motivo de cortesia es obligatorio';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND intro_client_id = p_intro_client_id
    AND intro_client_id IS NOT NULL
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva de clase intro no encontrada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion seleccionada no esta disponible';
  END IF;

  SELECT COALESCE(
    MAX(COALESCE(sda.slot_capacity, NULLIF(sda.targets, 0) * 4)),
    12
  )
  INTO v_capacity
  FROM public.session_distance_allocations sda
  WHERE sda.session_id = p_session_id
    AND sda.distance_m = 10;

  SELECT COUNT(*)
  INTO v_reserved
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.distance_m = 10
    AND b.status IN ('reserved', 'attended', 'no_show')
    AND b.id <> p_booking_id;

  IF v_reserved >= v_capacity THEN
    RAISE EXCEPTION 'El turno seleccionado no tiene cupo disponible para 10 m';
  END IF;

  UPDATE public.intro_clients
  SET
    full_name = btrim(p_full_name),
    age = p_age,
    phone = NULLIF(btrim(COALESCE(p_phone, '')), '')
  WHERE id = p_intro_client_id;

  UPDATE public.bookings
  SET
    session_id = p_session_id,
    distance_m = 10,
    updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.intro_payments
  SET
    amount = p_amount_paid,
    payment_method = COALESCE(NULLIF(btrim(p_payment_method), ''), 'not_applicable'),
    paid_at = CASE
      WHEN v_payment_status = 'paid' THEN COALESCE(paid_at, now())
      ELSE NULL
    END,
    intro_class_type = v_intro_class_type,
    payment_status = v_payment_status,
    courtesy_reason = CASE
      WHEN v_intro_class_type = 'courtesy' THEN NULLIF(btrim(COALESCE(p_courtesy_reason, '')), '')
      ELSE NULL
    END,
    courtesy_authorized_by_profile_id = CASE
      WHEN v_intro_class_type = 'courtesy' THEN v_actor_id
      ELSE NULL
    END
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

GRANT EXECUTE ON FUNCTION public.admin_update_intro_class(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  numeric,
  text,
  text,
  text,
  text
) TO authenticated;

COMMENT ON FUNCTION public.admin_update_intro_class(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid,
  numeric,
  text,
  text,
  text,
  text
) IS
  'Edita una clase intro completa desde admin: prospecto, horario y estado de pago.';
