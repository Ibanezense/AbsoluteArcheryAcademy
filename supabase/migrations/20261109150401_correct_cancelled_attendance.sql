-- Reclassify closed credits without reopening a cycle or rewriting its original expiration.
CREATE TABLE public.attendance_expiration_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id),
  expiration_event_id uuid NOT NULL REFERENCES public.membership_class_expirations(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id),
  credit_kind text NOT NULL CHECK (credit_kind IN ('normal','recovery')),
  corrected_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_expiration_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_expiration_corrections_read ON public.attendance_expiration_corrections
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));
REVOKE ALL ON public.attendance_expiration_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.attendance_expiration_corrections TO authenticated;
GRANT ALL ON public.attendance_expiration_corrections TO service_role;

CREATE OR REPLACE FUNCTION public.admin_correct_cancelled_attendance(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid(); v_booking public.bookings; v_session public.sessions;
  v_membership public.student_memberships; v_expiration public.membership_class_expirations;
  v_kind text; v_count integer; v_balance integer; v_committed integer; v_granted integer; v_used integer;
BEGIN
  IF v_actor IS NULL OR NOT COALESCE(public.is_admin_user(),false) THEN RAISE EXCEPTION 'Solo administradores pueden corregir asistencia'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.student_id IS NULL THEN RAISE EXCEPTION 'Reserva de alumno no encontrada'; END IF;
  IF v_booking.status='attended' THEN RETURN jsonb_build_object('success',true,'already_corrected',true); END IF;
  IF v_booking.status <> 'cancelled' THEN RAISE EXCEPTION 'Solo se pueden corregir reservas canceladas'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_booking.student_id::text || ':' || v_booking.session_id::text, 0));
  SELECT * INTO v_session FROM public.sessions WHERE id=v_booking.session_id;
  IF v_session.id IS NULL OR v_session.start_at>now() THEN RAISE EXCEPTION 'Solo se pueden corregir clases que ya comenzaron'; END IF;
  SELECT * INTO v_membership FROM public.student_memberships WHERE id=v_booking.active_membership_id AND student_id=v_booking.student_id FOR UPDATE;
  IF v_membership.id IS NULL THEN RAISE EXCEPTION 'No se encontró la membresía original del alumno'; END IF;
  PERFORM 1 FROM public.students WHERE id=v_booking.student_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id<>v_booking.id AND b.student_id=v_booking.student_id AND b.session_id=v_booking.session_id AND b.status IN ('reserved','attended')) THEN
    RAISE EXCEPTION 'Ya existe una reserva o asistencia para este alumno en el turno';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_cancellations c WHERE c.booking_id=v_booking.id AND (c.review_status='pending' OR c.resolution='no_show')) THEN
    RAISE EXCEPTION 'La cancelación requiere revisión o ya consumió una clase';
  END IF;
  IF EXISTS (SELECT 1 FROM public.student_credit_ledger l WHERE l.booking_id=v_booking.id AND l.movement_type IN ('attendance_consumed','recovery_consumed','student_cancellation_no_show')) THEN
    RAISE EXCEPTION 'La reserva ya tiene un consumo registrado';
  END IF;
  IF (v_session.start_at AT TIME ZONE 'America/Lima')::date < v_membership.start_date OR
     (v_membership.end_date IS NOT NULL AND (v_session.start_at AT TIME ZONE 'America/Lima')::date > v_membership.end_date) THEN
    RAISE EXCEPTION 'La clase está fuera de la vigencia de la membresía';
  END IF;
  v_kind := CASE WHEN v_booking.credit_kind='recovery' THEN 'recovery' ELSE 'normal' END;
  IF v_membership.unused_classes_finalized_at IS NOT NULL THEN
    IF v_kind='recovery' THEN
      SELECT r.classes_granted INTO v_granted FROM public.membership_recovery_credits r
        WHERE r.id=v_booking.recovery_credit_id AND r.student_membership_id=v_membership.id AND r.student_id=v_booking.student_id FOR UPDATE;
      IF v_granted IS NULL THEN RAISE EXCEPTION 'No se encontró la recuperación original'; END IF;
      SELECT COALESCE(sum(greatest(-x.net_delta,0)),0)::integer INTO v_used FROM (
        SELECT l.booking_id,sum(l.delta)::integer AS net_delta
        FROM public.student_credit_ledger l JOIN public.bookings b ON b.id=l.booking_id
        WHERE b.recovery_credit_id=v_booking.recovery_credit_id
          AND l.movement_type IN ('recovery_consumed','student_cancellation_no_show','no_show_reversal_refund')
        GROUP BY l.booking_id
      ) x;
      IF v_used>=v_granted THEN RAISE EXCEPTION 'La recuperación original ya fue utilizada'; END IF;
    END IF;
    SELECT * INTO v_expiration FROM public.membership_class_expirations WHERE student_membership_id=v_membership.id FOR UPDATE;
    IF v_expiration.id IS NULL THEN RAISE EXCEPTION 'No hay clases vencidas disponibles para corregir'; END IF;
    SELECT count(*)::integer INTO v_count FROM public.attendance_expiration_corrections WHERE expiration_event_id=v_expiration.id AND credit_kind=v_kind;
    IF v_count >= (CASE WHEN v_kind='normal' THEN v_expiration.normal_classes ELSE v_expiration.recovery_classes END) THEN
      RAISE EXCEPTION 'No hay clases vencidas disponibles para corregir';
    END IF;
    INSERT INTO public.attendance_expiration_corrections(booking_id,expiration_event_id,student_id,student_membership_id,credit_kind,corrected_by)
      VALUES(v_booking.id,v_expiration.id,v_booking.student_id,v_membership.id,v_kind,v_actor);
    INSERT INTO public.student_credit_ledger(student_id,student_membership_id,booking_id,movement_type,delta,balance_after,reason,performed_by_profile_id)
      VALUES(v_booking.student_id,v_membership.id,v_booking.id,'admin_adjustment',1,1,'Reclasificación de clase vencida por asistencia corregida',v_actor);
    v_balance := 0;
  ELSE
    IF v_kind='recovery' THEN
      SELECT count(*)::integer INTO v_committed FROM public.bookings b WHERE b.id<>v_booking.id AND b.recovery_credit_id=v_booking.recovery_credit_id AND (b.status='reserved' OR EXISTS (SELECT 1 FROM public.booking_cancellations c WHERE c.booking_id=b.id AND c.review_status='pending'));
      UPDATE public.membership_recovery_credits SET classes_remaining=classes_remaining-1,updated_at=now()
        WHERE id=v_booking.recovery_credit_id AND student_membership_id=v_membership.id AND classes_remaining>v_committed RETURNING classes_remaining INTO v_balance;
    ELSE
      SELECT count(*)::integer INTO v_committed FROM public.bookings b WHERE b.id<>v_booking.id AND b.active_membership_id=v_membership.id AND COALESCE(b.credit_kind,'normal')='normal' AND (b.status='reserved' OR EXISTS (SELECT 1 FROM public.booking_cancellations c WHERE c.booking_id=b.id AND c.review_status='pending'));
      UPDATE public.student_memberships SET classes_remaining=classes_remaining-1,classes_used=classes_used+1,updated_at=now()
        WHERE id=v_membership.id AND classes_remaining>v_committed RETURNING classes_remaining INTO v_balance;
    END IF;
    IF v_balance IS NULL THEN RAISE EXCEPTION 'No hay una clase disponible sin comprometer otras reservas'; END IF;
  END IF;
  INSERT INTO public.student_credit_ledger(student_id,student_membership_id,booking_id,movement_type,delta,balance_after,reason,performed_by_profile_id)
    VALUES(v_booking.student_id,v_membership.id,v_booking.id,CASE WHEN v_kind='recovery' THEN 'recovery_consumed' ELSE 'attendance_consumed' END,-1,v_balance,'Asistencia corregida de reserva cancelada',v_actor);
  UPDATE public.bookings SET status='attended',attendance_marked_by=v_actor,attendance_marked_at=now(),updated_at=now(),
    admin_notes=concat_ws(E'\n',CASE WHEN NULLIF(btrim(admin_notes),'') IS NOT NULL THEN 'Nota anterior (histórica): ' || admin_notes END,'Asistencia corregida por administración.') WHERE id=v_booking.id;
  IF v_membership.unused_classes_finalized_at IS NULL THEN PERFORM public.sync_student_membership_operational_status(v_booking.student_id); END IF;
  RETURN jsonb_build_object('success',true,'already_corrected',false);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_correct_cancelled_attendance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_cancelled_attendance(uuid) TO authenticated,service_role;
