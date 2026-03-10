-- ============================================================================
-- ADMIN ATTENDANCE V2 RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Exponer roster diario sobre students + bookings.student_id
-- 2. Marcar asistencia con contrato JSON estable para frontend
-- 3. Cancelar una reserva individual desde asistencia devolviendo credito opcional
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_daily_roster(date);
CREATE OR REPLACE FUNCTION public.get_daily_roster(p_date date)
RETURNS TABLE (
  booking_id uuid,
  session_id uuid,
  session_start_at timestamptz,
  student_id uuid,
  student_name text,
  student_avatar_url text,
  booking_status text,
  admin_notes text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer
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
    RAISE EXCEPTION 'Solo administradores pueden ver el roster diario';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.session_id,
    s.start_at AS session_start_at,
    st.id AS student_id,
    st.full_name AS student_name,
    st.avatar_url AS student_avatar_url,
    b.status::text AS booking_status,
    b.admin_notes,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  INNER JOIN public.students st
    ON st.id = b.student_id
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = p_date
    AND b.status IN ('reserved', 'attended', 'no_show')
  ORDER BY s.start_at ASC, st.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_roster(date) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_mark_attendance(uuid, boolean);
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
  v_new_status text;
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

  v_new_status := CASE WHEN p_attended THEN 'attended' ELSE 'no_show' END;

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
  WHERE id = p_booking_id;

  IF p_refund AND v_booking.active_membership_id IS NOT NULL THEN
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
      'Cancelacion individual desde asistencia/admin',
      v_actor_id,
      now()
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'message', CASE
      WHEN p_refund THEN 'Reserva cancelada y clase devuelta'
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

COMMENT ON FUNCTION public.get_daily_roster(date) IS
  'Retorna el roster diario V2 para admin usando students y bookings.student_id.';

COMMENT ON FUNCTION public.admin_mark_attendance(uuid, boolean) IS
  'Marca asistencia o no_show sobre una reserva V2 y retorna JSON compatible con el frontend admin.';

COMMENT ON FUNCTION public.admin_cancel_booking(uuid, boolean) IS
  'Cancela una reserva individual desde admin/asistencia y devuelve credito opcionalmente.';
