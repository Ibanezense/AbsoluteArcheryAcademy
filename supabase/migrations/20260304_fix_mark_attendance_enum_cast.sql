-- ============================================================================
-- FIX: admin_mark_attendance - cast text a booking_status enum
-- Fecha: 2026-03-04
-- Error: column "status" is of type booking_status but expression is of type text
-- ============================================================================

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
