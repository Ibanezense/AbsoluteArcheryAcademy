-- ============================================================================
-- FIX: cancelaciones de reservas y turnos devuelven creditos correctos
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Permitir al alumno/tutor cancelar una reserva mientras la clase no haya terminado.
-- 2. Devolver credito usando la membresia vinculada a la reserva y la fecha de la sesion.
-- 3. Asegurar que la cancelacion de turno completo desde admin devuelva clases a todas las reservas activas afectadas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.cancel_booking(uuid);
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_session public.sessions;
  v_membership public.student_memberships;
  v_balance_after integer;
  v_session_date date;
  v_membership_is_refundable boolean := false;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF NOT public.can_access_student(v_booking.student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta reserva';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes cancelar reservas activas';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.end_at <= now() THEN
    RAISE EXCEPTION 'La clase ya finalizo';
  END IF;

  v_session_date := (v_session.start_at AT TIME ZONE 'America/Lima')::date;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL THEN
    SELECT *
    INTO v_membership
    FROM public.student_memberships
    WHERE id = v_booking.active_membership_id
    FOR UPDATE;

    v_membership_is_refundable := v_membership IS NOT NULL
      AND v_membership.status = 'active'
      AND v_membership.start_date <= v_session_date
      AND (v_membership.end_date IS NULL OR v_membership.end_date >= v_session_date);

    IF v_membership_is_refundable THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_membership.id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_membership.id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion antes de finalizar la clase',
        v_actor_id,
        now()
      );
    ELSE
      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_no_refund',
        0,
        COALESCE(v_membership.classes_remaining, 0),
        'Cancelacion sin devolucion: membresia no vigente para la fecha de la sesion',
        v_actor_id,
        now()
      );
    END IF;
  END IF;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_cancel_booking(uuid);
DROP FUNCTION IF EXISTS public.admin_cancel_booking(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id uuid,
  p_refund boolean DEFAULT true
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
  v_membership public.student_memberships;
  v_balance_after integer;
  v_session_date date;
  v_membership_is_refundable boolean := false;
  v_refunded boolean := false;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservas activas';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  v_session_date := (v_session.start_at AT TIME ZONE 'America/Lima')::date;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  IF p_refund AND v_booking.active_membership_id IS NOT NULL THEN
    SELECT *
    INTO v_membership
    FROM public.student_memberships
    WHERE id = v_booking.active_membership_id
    FOR UPDATE;

    v_membership_is_refundable := v_membership IS NOT NULL
      AND v_membership.status = 'active'
      AND v_membership.start_date <= v_session_date
      AND (v_membership.end_date IS NULL OR v_membership.end_date >= v_session_date);

    IF v_membership_is_refundable THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_membership.id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_membership.id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion individual desde admin',
        v_actor_id,
        now()
      );

      v_refunded := true;
    ELSE
      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_no_refund',
        0,
        COALESCE(v_membership.classes_remaining, 0),
        'Cancelacion admin sin devolucion: membresia no vigente para la fecha de la sesion',
        v_actor_id,
        now()
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'refunded', v_refunded
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_cancel_session(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_cancel_session(
  p_session uuid,
  p_refund boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_balance_after integer;
  v_affected_count integer := 0;
  v_session_date date;
  v_membership_is_refundable boolean := false;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  v_session_date := (v_session.start_at AT TIME ZONE 'America/Lima')::date;

  UPDATE public.sessions
  SET
    status = 'cancelled'
  WHERE id = p_session;

  FOR v_booking IN
    SELECT *
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.status = 'reserved'
    FOR UPDATE
  LOOP
    UPDATE public.bookings
    SET
      status = 'cancelled',
      cancelled_by_profile_id = v_actor_id,
      cancelled_at = now(),
      updated_at = now()
    WHERE id = v_booking.id;

    IF p_refund AND v_booking.active_membership_id IS NOT NULL THEN
      SELECT *
      INTO v_membership
      FROM public.student_memberships
      WHERE id = v_booking.active_membership_id
      FOR UPDATE;

      v_membership_is_refundable := v_membership IS NOT NULL
        AND v_membership.status = 'active'
        AND v_membership.start_date <= v_session_date
        AND (v_membership.end_date IS NULL OR v_membership.end_date >= v_session_date);

      IF v_membership_is_refundable THEN
        UPDATE public.student_memberships
        SET
          classes_used = GREATEST(classes_used - 1, 0),
          classes_remaining = classes_remaining + 1,
          updated_at = now()
        WHERE id = v_membership.id
        RETURNING classes_remaining INTO v_balance_after;

        INSERT INTO public.student_credit_ledger (
          student_id,
          student_membership_id,
          booking_id,
          movement_type,
          delta,
          balance_after,
          reason,
          performed_by_profile_id,
          created_at
        )
        VALUES (
          v_booking.student_id,
          v_membership.id,
          v_booking.id,
          'booking_cancelled_refund',
          1,
          v_balance_after,
          'Cancelacion de turno completa desde admin',
          v_actor_id,
          now()
        );
      ELSE
        INSERT INTO public.student_credit_ledger (
          student_id,
          student_membership_id,
          booking_id,
          movement_type,
          delta,
          balance_after,
          reason,
          performed_by_profile_id,
          created_at
        )
        VALUES (
          v_booking.student_id,
          v_booking.active_membership_id,
          v_booking.id,
          'booking_cancelled_no_refund',
          0,
          COALESCE(v_membership.classes_remaining, 0),
          'Cancelacion de turno sin devolucion: membresia no vigente para la fecha de la sesion',
          v_actor_id,
          now()
        );
      END IF;
    END IF;

    v_affected_count := v_affected_count + 1;
  END LOOP;

  RETURN v_affected_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_session(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva accesible antes de que termine la clase y devuelve credito si la membresia vinculada cubre la fecha de la sesion.';

COMMENT ON FUNCTION public.admin_cancel_booking(uuid, boolean) IS
  'Cancela una reserva individual desde admin y devuelve credito si p_refund=true y la membresia vinculada cubre la fecha de la sesion.';

COMMENT ON FUNCTION public.admin_cancel_session(uuid, boolean) IS
  'Cancela un turno completo desde admin y devuelve creditos de las reservas activas afectadas si p_refund=true y la membresia vinculada cubre la fecha de la sesion.';
