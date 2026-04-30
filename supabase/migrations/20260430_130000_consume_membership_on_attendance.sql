-- ============================================================================
-- Fix: consume membership credits on attendance, not on reservation
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Reservar una clase no debe descontar clases restantes.
-- 2. Asistio/no_show consume una clase una sola vez.
-- 3. Cancelar una reserva pendiente no devuelve credito porque no fue consumido.
-- 4. Restaurar reservas pendientes antiguas que ya fueron cobradas al reservar.
-- ============================================================================

ALTER TABLE public.student_credit_ledger
  DROP CONSTRAINT IF EXISTS student_credit_ledger_movement_type_check;

ALTER TABLE public.student_credit_ledger
  ADD CONSTRAINT student_credit_ledger_movement_type_check
  CHECK (
    movement_type IN (
      'membership_activation',
      'membership_renewal',
      'booking_reserved',
      'booking_cancelled_refund',
      'booking_cancelled_no_refund',
      'booking_reservation_released',
      'attendance_consumed',
      'admin_adjustment',
      'reward_credit',
      'migration_seed',
      'migration_usage'
    )
  );

WITH charged_reserved_bookings AS (
  SELECT
    b.id AS booking_id,
    b.student_id,
    b.active_membership_id
  FROM public.bookings b
  WHERE b.status = 'reserved'
    AND b.active_membership_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.student_credit_ledger old_charge
      WHERE old_charge.booking_id = b.id
        AND old_charge.student_membership_id = b.active_membership_id
        AND old_charge.movement_type = 'booking_reserved'
        AND old_charge.delta < 0
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_credit_ledger already_released
      WHERE already_released.booking_id = b.id
        AND already_released.student_membership_id = b.active_membership_id
        AND already_released.movement_type = 'booking_reservation_released'
    )
),
release_counts AS (
  SELECT
    active_membership_id,
    COUNT(*)::integer AS release_count
  FROM charged_reserved_bookings
  GROUP BY active_membership_id
),
released_memberships AS (
  UPDATE public.student_memberships sm
  SET
    classes_used = GREATEST(sm.classes_used - rc.release_count, 0),
    classes_remaining = sm.classes_remaining + rc.release_count,
    updated_at = now()
  FROM release_counts rc
  WHERE sm.id = rc.active_membership_id
  RETURNING sm.id, sm.classes_remaining
)
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
  crb.student_id,
  crb.active_membership_id,
  crb.booking_id,
  'booking_reservation_released',
  1,
  rm.classes_remaining,
  'Restauracion por cambio de regla: reservar ya no consume clases',
  NULL,
  now()
FROM charged_reserved_bookings crb
INNER JOIN released_memberships rm
  ON rm.id = crb.active_membership_id;

DROP FUNCTION IF EXISTS public.book_session(uuid);
DROP FUNCTION IF EXISTS public.book_session(uuid, uuid);
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
  v_actor_id uuid;
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
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_session
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

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_pending_reserved_count
  FROM public.bookings b
  WHERE b.student_id = v_student_id
    AND b.active_membership_id = v_membership.id
    AND b.status = 'reserved';

  IF v_pending_reserved_count >= COALESCE(v_membership.classes_remaining, 0) THEN
    RAISE EXCEPTION 'El alumno ya tiene reservadas todas sus clases disponibles';
  END IF;

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

  v_availability := public.check_session_availability_v3(
    p_session,
    v_student_id
  );

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
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid, text, boolean);
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
  v_actor_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_pending_reserved_count integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
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
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  IF NOT p_force THEN
    SELECT COUNT(*)::integer
    INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.student_id = p_student_id
      AND b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count >= COALESCE(v_membership.classes_remaining, 0) THEN
      RAISE EXCEPTION 'El alumno ya tiene reservadas todas sus clases disponibles';
    END IF;
  END IF;

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
    v_availability := public.check_session_availability_v3(
      p_session_id,
      p_student_id
    );

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
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
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

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated;

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

  IF v_booking.status NOT IN ('reserved', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'La reserva no puede pasar por asistencia desde su estado actual';
  END IF;

  v_new_status := CASE WHEN p_attended THEN 'attended'::public.booking_status ELSE 'no_show'::public.booking_status END;

  IF v_booking.status = 'reserved'
    AND v_booking.active_membership_id IS NOT NULL
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

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'attendance_audit'
  ) THEN
    BEGIN
      INSERT INTO public.attendance_audit (
        booking_id,
        admin_id,
        status_before,
        status_after,
        note,
        created_at
      )
      VALUES (
        p_booking_id,
        v_actor_id,
        v_booking.status,
        v_new_status,
        CASE
          WHEN p_attended THEN 'Marcado como asistio desde admin'
          ELSE 'Marcado como no_show desde admin'
        END,
        now()
      );
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;
  END IF;

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
  v_booking public.bookings;
  v_session public.sessions;
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

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL THEN
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
      'Reserva cancelada sin devolucion porque no habia consumido credito',
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

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL THEN
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
      'Cancelacion admin sin devolucion porque la reserva no habia consumido credito',
      v_actor_id,
      now()
    FROM public.student_memberships sm
    WHERE sm.id = v_booking.active_membership_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'message', 'Reserva cancelada'
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
      AND status = 'reserved'
    FOR UPDATE
  LOOP
    UPDATE public.bookings
    SET
      status = 'cancelled',
      cancelled_by_profile_id = v_actor_id,
      cancelled_at = now(),
      updated_at = now()
    WHERE id = v_booking.id;

    IF v_booking.active_membership_id IS NOT NULL THEN
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
        'Cancelacion de turno admin sin devolucion porque la reserva no habia consumido credito',
        v_actor_id,
        now()
      FROM public.student_memberships sm
      WHERE sm.id = v_booking.active_membership_id;
    END IF;

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

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion para el alumno y vincula la membresia aplicable sin descontar credito hasta asistencia/no_show.';

COMMENT ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) IS
  'Reserva una sesion desde admin sin descontar credito hasta asistencia/no_show. Puede forzar cupo si p_force=true.';

COMMENT ON FUNCTION public.admin_mark_attendance(uuid, boolean) IS
  'Marca asistencia o no_show y consume una clase solo al pasar desde reserved.';

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva pendiente de alumno/tutor sin devolver credito porque reservar no consume clases.';

COMMENT ON FUNCTION public.admin_cancel_booking(uuid, boolean) IS
  'Cancela una reserva pendiente desde admin sin devolver credito porque reservar no consume clases.';

COMMENT ON FUNCTION public.admin_cancel_session(uuid, boolean) IS
  'Cancela un turno completo desde admin sin devolver creditos de reservas pendientes porque reservar no consume clases.';
