-- Allow administrators to regularize past classes without the daily close cancelling them.
-- Membership expiry and the existing credit ledger remain authoritative.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS admin_retroactive_attendance boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.admin_retroactive_attendance IS
  'Server-verified past booking created by an administrator; exempt from day-end closure only.';

-- Preserve already-created pending regularizations, including those made before this migration.
UPDATE public.bookings b
SET admin_retroactive_attendance = true
FROM public.sessions s, public.profiles p
WHERE b.session_id = s.id AND b.booked_by_profile_id = p.id
  AND p.role = 'admin' AND p.is_active = true
  AND b.status = 'reserved' AND NOT b.admin_retroactive_attendance
  AND (b.created_at AT TIME ZONE 'America/Lima')::date > (s.start_at AT TIME ZONE 'America/Lima')::date;

CREATE OR REPLACE FUNCTION public.set_admin_retroactive_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Never trust a client-supplied flag or an administrator ID supplied by another user.
  NEW.admin_retroactive_attendance := EXISTS (
    SELECT 1 FROM public.sessions s, public.profiles p
    WHERE s.id = NEW.session_id AND p.id = auth.uid()
      AND p.role = 'admin' AND p.is_active = true
      AND NEW.booked_by_profile_id = p.id
      AND (s.start_at AT TIME ZONE 'America/Lima')::date < (now() AT TIME ZONE 'America/Lima')::date
      AND (NEW.created_at AT TIME ZONE 'America/Lima')::date > (s.start_at AT TIME ZONE 'America/Lima')::date
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_admin_retroactive_attendance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_admin_retroactive_attendance ON public.bookings;
CREATE TRIGGER bookings_admin_retroactive_attendance
BEFORE INSERT OR UPDATE OF admin_retroactive_attendance, session_id, booked_by_profile_id, created_at
ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_admin_retroactive_attendance();

CREATE OR REPLACE FUNCTION public.close_unattended_daily_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking_id uuid; v_count integer := 0; v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  FOR v_booking_id IN
    SELECT b.id FROM public.bookings b
    JOIN public.sessions s ON s.id = b.session_id
    JOIN public.student_memberships m ON m.id = b.active_membership_id
    WHERE b.status = 'reserved' AND b.student_id IS NOT NULL
      AND NOT b.admin_retroactive_attendance
      AND m.attendance_policy_started_on IS NOT NULL
      AND (s.start_at AT TIME ZONE 'America/Lima')::date >= m.attendance_policy_started_on
      AND (s.start_at AT TIME ZONE 'America/Lima')::date < v_today
    ORDER BY b.id FOR UPDATE OF b SKIP LOCKED
  LOOP
    IF public.close_pending_booking(v_booking_id,'day_end') THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.close_unattended_daily_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_unattended_daily_bookings() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_attendance(p_booking_id uuid, p_attended boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_new_status public.booking_status;
  v_balance integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar asistencia';
  END IF;
  IF p_attended IS NOT TRUE THEN
    RAISE EXCEPTION 'Ya no se marcan inasistencias; solo se registra asistencia';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF v_booking.status = 'cancelled' THEN RAISE EXCEPTION 'No se puede marcar una reserva cancelada'; END IF;
  v_new_status := CASE WHEN p_attended THEN 'attended'::public.booking_status ELSE 'no_show'::public.booking_status END;
  IF v_booking.status IN ('attended', 'no_show') THEN
    RETURN json_build_object('success', true, 'booking_id', p_booking_id,
      'previous_status', v_booking.status, 'new_status', v_booking.status,
      'message', 'Asistencia ya registrada');
  END IF;
  IF v_booking.status <> 'reserved' THEN RAISE EXCEPTION 'Estado de reserva invalido'; END IF;

  IF v_booking.active_membership_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_memberships m WHERE m.id = v_booking.active_membership_id
      AND m.attendance_policy_started_on IS NOT NULL
      AND (m.unused_classes_finalized_at IS NOT NULL OR m.end_date < (now() AT TIME ZONE 'America/Lima')::date)
  ) THEN RAISE EXCEPTION 'La membresía venció; sus clases son no recuperables'; END IF;

  IF v_booking.active_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_credit_ledger ledger
    WHERE ledger.booking_id = p_booking_id
      AND ledger.movement_type IN ('attendance_consumed', 'recovery_consumed')
  ) THEN
    IF v_booking.credit_kind = 'recovery' THEN
      UPDATE public.membership_recovery_credits
      SET classes_remaining = classes_remaining - 1, updated_at = now()
      WHERE id = v_booking.recovery_credit_id AND classes_remaining > 0
      RETURNING classes_remaining INTO v_balance;
      IF v_balance IS NULL THEN RAISE EXCEPTION 'La recuperación comprometida ya no está disponible'; END IF;
    ELSE
      UPDATE public.student_memberships
      SET classes_used = classes_used + 1,
          classes_remaining = classes_remaining - 1,
          updated_at = now()
      WHERE id = v_booking.active_membership_id AND classes_remaining > 0
      RETURNING classes_remaining INTO v_balance;
      IF v_balance IS NULL THEN RAISE EXCEPTION 'La membresía no tiene saldo disponible'; END IF;
    END IF;

    INSERT INTO public.student_credit_ledger (
      student_id, student_membership_id, booking_id, movement_type,
      delta, balance_after, reason, performed_by_profile_id
    ) VALUES (
      v_booking.student_id, v_booking.active_membership_id, v_booking.id,
      CASE WHEN v_booking.credit_kind = 'recovery' THEN 'recovery_consumed' ELSE 'attendance_consumed' END,
      -1, v_balance,
      CASE
        WHEN v_booking.credit_kind = 'recovery' AND p_attended THEN 'Recuperación consumida por asistencia'
        WHEN v_booking.credit_kind = 'recovery' THEN 'Recuperación consumida por inasistencia'
        WHEN p_attended THEN 'Clase normal consumida por asistencia'
        ELSE 'Clase normal consumida por inasistencia'
      END,
      v_actor_id
    );
  END IF;

  UPDATE public.bookings SET status = v_new_status,
    attendance_marked_by = v_actor_id, attendance_marked_at = now(), updated_at = now()
  WHERE id = p_booking_id;
  IF v_booking.student_id IS NOT NULL THEN
    PERFORM public.sync_student_membership_operational_status(v_booking.student_id);
  END IF;
  RETURN json_build_object('success', true, 'booking_id', p_booking_id,
    'previous_status', v_booking.status, 'new_status', v_new_status,
    'message', CASE WHEN p_attended THEN 'Asistencia marcada correctamente' ELSE 'Marcado como no asistió' END);
END;
$function$
;
