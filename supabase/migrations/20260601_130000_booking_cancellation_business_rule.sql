-- ============================================================================
-- Booking cancellation business rule
-- Date: 2026-06-01
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_by_role text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_cancelled_by_role_chk'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_cancelled_by_role_chk
      CHECK (
        cancelled_by_role IS NULL
        OR cancelled_by_role IN ('student', 'guardian', 'admin')
      );
  END IF;
END;
$$;

DROP POLICY IF EXISTS "User can cancel own booking" ON public.bookings;
DROP POLICY IF EXISTS "User can cancel own booking via student" ON public.bookings;

CREATE OR REPLACE FUNCTION public.admin_mark_attendance(
  p_booking_id uuid,
  p_attended boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_new_status public.booking_status;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar asistencia';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede marcar asistencia sobre una reserva cancelada';
  END IF;

  v_new_status := CASE WHEN p_attended THEN 'attended'::public.booking_status ELSE 'no_show'::public.booking_status END;

  IF v_booking.status = v_new_status OR v_booking.status IN ('attended', 'no_show') THEN
    RETURN json_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'previous_status', v_booking.status,
      'new_status', v_booking.status,
      'message', 'Asistencia ya registrada'
    );
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'La reserva no puede pasar por asistencia desde su estado actual';
  END IF;

  IF v_booking.active_membership_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.movement_type = 'attendance_consumed'
    )
  THEN
    UPDATE public.student_memberships
    SET
      classes_used = classes_used + 1,
      classes_remaining = GREATEST(classes_remaining - 1, 0),
      updated_at = now()
    WHERE id = v_booking.active_membership_id
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
      v_booking.active_membership_id,
      v_booking.id,
      'attendance_consumed',
      -1,
      v_balance_after,
      CASE
        WHEN p_attended THEN 'Clase consumida por asistencia'
        ELSE 'Clase consumida por no_show'
      END,
      v_actor_id,
      now()
    );
  END IF;

  UPDATE public.bookings
  SET
    status = v_new_status,
    attendance_marked_by = v_actor_id,
    attendance_marked_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'previous_status', v_booking.status,
    'new_status', v_new_status,
    'message', CASE
      WHEN p_attended THEN 'Asistencia marcada correctamente'
      ELSE 'Marcado como no asistio'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_attendance(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_booking public.bookings;
  v_session public.sessions;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT role
  INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id;

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

  IF v_booking.status = 'cancelled' THEN
    RETURN v_booking;
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'La asistencia ya fue registrada; solicita ayuda al administrador';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.start_at < now() THEN
    RAISE EXCEPTION 'La clase ya inicio';
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_by_role = CASE
      WHEN v_actor_role = 'guardian' THEN 'guardian'
      WHEN v_actor_role = 'admin' THEN 'admin'
      ELSE 'student'
    END,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = v_booking.id
        AND scl.movement_type = 'booking_cancelled_no_refund'
    )
  THEN
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
    SELECT
      v_booking.student_id,
      v_booking.active_membership_id,
      v_booking.id,
      'booking_cancelled_no_refund',
      0,
      sm.classes_remaining,
      'Reserva cancelada antes de asistencia; no habia credito consumido',
      v_actor_id,
      now()
    FROM public.student_memberships sm
    WHERE sm.id = v_booking.active_membership_id;
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
  v_balance_after integer;
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

  IF v_booking.status = 'cancelled' THEN
    RETURN json_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'refunded', false,
      'message', 'Reserva ya cancelada'
    );
  END IF;

  IF v_booking.status NOT IN ('reserved', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'La reserva no puede cancelarse desde su estado actual';
  END IF;

  IF p_refund
    AND v_booking.active_membership_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.student_membership_id = v_booking.active_membership_id
        AND scl.movement_type = 'attendance_consumed'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.student_membership_id = v_booking.active_membership_id
        AND scl.movement_type = 'booking_cancelled_refund'
    )
  THEN
    UPDATE public.student_memberships
    SET
      classes_used = GREATEST(classes_used - 1, 0),
      classes_remaining = classes_remaining + 1,
      updated_at = now()
    WHERE id = v_booking.active_membership_id
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
      v_booking.active_membership_id,
      v_booking.id,
      'booking_cancelled_refund',
      1,
      v_balance_after,
      'Cancelacion admin posterior a asistencia; credito restaurado',
      v_actor_id,
      now()
    );

    v_refunded := true;
  ELSIF v_booking.active_membership_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger scl
      WHERE scl.booking_id = p_booking_id
        AND scl.student_membership_id = v_booking.active_membership_id
        AND scl.movement_type IN ('booking_cancelled_no_refund', 'booking_cancelled_refund')
    )
  THEN
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
    SELECT
      v_booking.student_id,
      v_booking.active_membership_id,
      v_booking.id,
      'booking_cancelled_no_refund',
      0,
      sm.classes_remaining,
      'Cancelacion admin sin devolucion porque no habia credito consumido',
      v_actor_id,
      now()
    FROM public.student_memberships sm
    WHERE sm.id = v_booking.active_membership_id;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_by_role = 'admin',
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'refunded', v_refunded,
    'message', CASE
      WHEN v_refunded THEN 'Reserva cancelada y credito restaurado'
      ELSE 'Reserva cancelada'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid, boolean) TO authenticated;

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
  v_balance_after integer;
  v_cancelled_count integer := 0;
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

  FOR v_booking IN
    SELECT *
    FROM public.bookings
    WHERE session_id = p_session
      AND status IN ('reserved', 'attended', 'no_show')
    FOR UPDATE
  LOOP
    IF p_refund
      AND v_booking.active_membership_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.student_credit_ledger scl
        WHERE scl.booking_id = v_booking.id
          AND scl.student_membership_id = v_booking.active_membership_id
          AND scl.movement_type = 'attendance_consumed'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_credit_ledger scl
        WHERE scl.booking_id = v_booking.id
          AND scl.student_membership_id = v_booking.active_membership_id
          AND scl.movement_type = 'booking_cancelled_refund'
      )
    THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_booking.active_membership_id
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
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion de turno admin posterior a asistencia; credito restaurado',
        v_actor_id,
        now()
      );
    ELSIF v_booking.active_membership_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_credit_ledger scl
        WHERE scl.booking_id = v_booking.id
          AND scl.student_membership_id = v_booking.active_membership_id
          AND scl.movement_type IN ('booking_cancelled_no_refund', 'booking_cancelled_refund')
      )
    THEN
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
      SELECT
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_no_refund',
        0,
        sm.classes_remaining,
        'Cancelacion de turno admin sin devolucion porque no habia credito consumido',
        v_actor_id,
        now()
      FROM public.student_memberships sm
      WHERE sm.id = v_booking.active_membership_id;
    END IF;

    UPDATE public.bookings
    SET
      status = 'cancelled',
      cancelled_by_profile_id = v_actor_id,
      cancelled_by_role = 'admin',
      cancelled_at = now(),
      updated_at = now()
    WHERE id = v_booking.id;

    v_cancelled_count := v_cancelled_count + 1;
  END LOOP;

  UPDATE public.sessions
  SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = p_session;

  RETURN v_cancelled_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_session(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva de alumno/tutor hasta el inicio de clase inclusive, sin ajustar credito porque reservar no consume.';

COMMENT ON FUNCTION public.admin_cancel_booking(uuid, boolean) IS
  'Cancela una reserva desde admin en cualquier momento y restaura exactamente un credito solo si asistencia/no_show ya lo consumio.';

COMMENT ON FUNCTION public.admin_cancel_session(uuid, boolean) IS
  'Cancela un turno desde admin y aplica la misma devolucion idempotente por asistencia consumida.';

COMMENT ON FUNCTION public.admin_mark_attendance(uuid, boolean) IS
  'Marca asistencia/no_show una sola vez y bloquea reservas canceladas.';
