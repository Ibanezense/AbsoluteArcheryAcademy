BEGIN;

CREATE OR REPLACE FUNCTION public.validate_recovery_credit_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source public.student_memberships;
  v_receiver public.student_memberships;
BEGIN
  SELECT * INTO v_receiver FROM public.student_memberships WHERE id = NEW.student_membership_id;
  IF v_receiver.id IS NULL OR v_receiver.student_id <> NEW.student_id THEN
    RAISE EXCEPTION 'El ciclo receptor no pertenece al alumno indicado';
  END IF;
  IF NEW.source_membership_id IS NOT NULL THEN
    SELECT * INTO v_source FROM public.student_memberships WHERE id = NEW.source_membership_id;
    IF v_source.id IS NULL OR v_source.student_id <> NEW.student_id
      OR v_source.id = v_receiver.id OR v_source.start_date > v_receiver.start_date
    THEN
      RAISE EXCEPTION 'El ciclo de origen debe ser un ciclo anterior del mismo alumno';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recovery_credits_validate_source ON public.membership_recovery_credits;
CREATE TRIGGER recovery_credits_validate_source
  BEFORE INSERT OR UPDATE OF student_id, student_membership_id, source_membership_id
  ON public.membership_recovery_credits
  FOR EACH ROW EXECUTE FUNCTION public.validate_recovery_credit_source();

CREATE OR REPLACE FUNCTION public.prevent_overlapping_student_bookings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session public.sessions;
BEGIN
  IF NEW.status <> 'reserved' OR NEW.student_id IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.students WHERE id = NEW.student_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions WHERE id = NEW.session_id;
  IF EXISTS (
    SELECT 1
    FROM public.bookings existing_booking
    JOIN public.sessions existing_session ON existing_session.id = existing_booking.session_id
    WHERE existing_booking.student_id = NEW.student_id
      AND existing_booking.status = 'reserved'
      AND existing_booking.id <> NEW.id
      AND existing_session.start_at < v_session.end_at
      AND existing_session.end_at > v_session.start_at
  ) THEN
    RAISE EXCEPTION 'El alumno ya tiene otra reserva en un horario superpuesto';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_prevent_student_overlap ON public.bookings;
CREATE TRIGGER bookings_prevent_student_overlap
  BEFORE INSERT OR UPDATE OF session_id, student_id, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_student_bookings();

CREATE OR REPLACE FUNCTION public.admin_finish_membership_freeze(
  p_purchase_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_freeze public.membership_freezes;
  v_cycle public.student_memberships;
  v_unused_days integer;
  v_resume_date date;
  v_booking_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden finalizar congelamientos';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;

  SELECT * INTO v_freeze FROM public.membership_freezes
  WHERE membership_purchase_id = p_purchase_id AND status = 'active' AND end_date >= v_today
  ORDER BY start_date, created_at FOR UPDATE LIMIT 1;
  IF v_freeze.id IS NULL THEN RAISE EXCEPTION 'No existe un congelamiento activo o futuro'; END IF;

  v_resume_date := GREATEST(v_today, v_freeze.start_date);
  v_unused_days := v_freeze.end_date - v_resume_date + 1;
  SELECT * INTO v_cycle FROM public.student_memberships membership
  WHERE membership.purchase_id = p_purchase_id
    AND membership.start_date <= v_freeze.start_date
    AND (membership.end_date IS NULL OR membership.end_date >= v_freeze.start_date)
  ORDER BY membership.cycle_number FOR UPDATE LIMIT 1;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'No se encontro el ciclo afectado'; END IF;

  UPDATE public.student_memberships SET
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE end_date - v_unused_days END,
    frozen_at = NULL, frozen_until = NULL, updated_at = now()
  WHERE id = v_cycle.id;
  UPDATE public.student_memberships SET start_date = start_date - v_unused_days,
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE end_date - v_unused_days END, updated_at = now()
  WHERE purchase_id = p_purchase_id AND cycle_number > v_cycle.cycle_number;
  UPDATE public.membership_fixed_schedules SET
    effective_until = CASE WHEN effective_until IS NULL THEN NULL ELSE effective_until - v_unused_days END,
    updated_at = now()
  WHERE purchase_id = p_purchase_id AND status = 'active';

  UPDATE public.membership_freezes SET
    status = CASE WHEN v_freeze.start_date >= v_today THEN 'cancelled' ELSE 'completed' END,
    end_date = CASE WHEN v_freeze.start_date >= v_today THEN end_date ELSE v_today - 1 END,
    duration_days = CASE WHEN v_freeze.start_date >= v_today THEN duration_days ELSE duration_days - v_unused_days END,
    notes = concat_ws(E'\n', notes, 'Finalizado anticipadamente: ' || btrim(p_reason))
  WHERE id = v_freeze.id;

  FOR v_booking_id IN
    SELECT booking.id
    FROM public.bookings booking
    JOIN public.sessions session ON session.id = booking.session_id
    JOIN public.student_memberships membership ON membership.id = booking.active_membership_id
    JOIN public.booking_cancellations cancellation ON cancellation.booking_id = booking.id
    WHERE membership.purchase_id = p_purchase_id
      AND booking.recurrence_assignment_id IS NOT NULL AND booking.status = 'cancelled'
      AND cancellation.cancellation_source = 'membership_freeze'
      AND cancellation.review_status = 'not_required'
      AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_resume_date AND v_freeze.end_date
    FOR UPDATE OF booking
  LOOP
    UPDATE public.booking_cancellations SET
      admin_reason = concat_ws(E'\n', admin_reason, 'Congelamiento revertido: ' || btrim(p_reason))
    WHERE booking_id = v_booking_id;
    UPDATE public.bookings SET status = 'reserved', cancelled_at = NULL,
      cancelled_by_profile_id = NULL, cancelled_by_role = NULL,
      admin_notes = concat_ws(E'\n', admin_notes, 'Reserva fija restaurada tras reactivación'), updated_at = now()
    WHERE id = v_booking_id;
  END LOOP;

  PERFORM public.admin_generate_fixed_bookings(p_purchase_id, v_resume_date);
  RETURN jsonb_build_object('success', true, 'unused_days_reversed', v_unused_days,
    'resume_date', v_resume_date, 'freeze_id', v_freeze.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_week_overview(
  p_student_id uuid DEFAULT NULL,
  p_reference_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_week_start date;
  v_classes jsonb;
  v_normal_remaining integer;
  v_recovery_remaining integer;
  v_weekly_target integer;
  v_weekly_completed integer;
  v_pending integer;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  v_week_start := p_reference_date - (EXTRACT(ISODOW FROM p_reference_date)::integer - 1);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', booking.id, 'start_at', session.start_at, 'end_at', session.end_at,
    'distance_m', booking.distance_m, 'status', booking.status,
    'booking_source', booking.booking_source, 'credit_kind', booking.credit_kind,
    'location_name', location.name, 'location_address', location.address
  ) ORDER BY session.start_at), '[]'::jsonb)
  INTO v_classes
  FROM public.bookings booking
  JOIN public.sessions session ON session.id = booking.session_id
  JOIN public.academy_locations location ON location.id = session.location_id
  WHERE booking.student_id = v_student_id
    AND (session.start_at AT TIME ZONE location.timezone)::date BETWEEN v_week_start AND v_week_start + 6
    AND booking.status IN ('reserved', 'attended', 'no_show');

  SELECT
    COALESCE(SUM(GREATEST(membership.classes_remaining - commitments.normal_reserved, 0)), 0)::integer,
    COALESCE(SUM(GREATEST(COALESCE(recovery.remaining, 0) - commitments.recovery_reserved, 0)), 0)::integer,
    COALESCE(MAX(membership.weekly_class_target), 0)::integer
  INTO v_normal_remaining, v_recovery_remaining, v_weekly_target
  FROM public.student_memberships membership
  LEFT JOIN LATERAL (
    SELECT SUM(credit.classes_remaining)::integer AS remaining
    FROM public.membership_recovery_credits credit WHERE credit.student_membership_id = membership.id
  ) recovery ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE booking.credit_kind = 'normal')::integer AS normal_reserved,
      COUNT(*) FILTER (WHERE booking.credit_kind = 'recovery')::integer AS recovery_reserved
    FROM public.bookings booking
    WHERE booking.active_membership_id = membership.id
      AND (booking.status = 'reserved' OR EXISTS (
        SELECT 1 FROM public.booking_cancellations cancellation
        WHERE cancellation.booking_id = booking.id AND cancellation.review_status = 'pending'
      ))
  ) commitments ON true
  WHERE membership.student_id = v_student_id AND membership.status = 'active'
    AND membership.start_date <= v_week_start + 6
    AND (membership.end_date IS NULL OR membership.end_date >= v_week_start);

  SELECT COUNT(*)::integer INTO v_weekly_completed
  FROM public.bookings booking JOIN public.sessions session ON session.id = booking.session_id
  WHERE booking.student_id = v_student_id AND booking.credit_kind = 'normal'
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_week_start AND v_week_start + 6
    AND booking.status IN ('reserved', 'attended', 'no_show');
  SELECT COUNT(*)::integer INTO v_pending FROM public.booking_cancellations cancellation
  WHERE cancellation.student_id = v_student_id AND cancellation.review_status = 'pending';

  RETURN jsonb_build_object('week_start', v_week_start, 'week_end', v_week_start + 6,
    'classes', v_classes, 'normal_classes_remaining', COALESCE(v_normal_remaining, 0),
    'recovery_classes_remaining', COALESCE(v_recovery_remaining, 0),
    'weekly_target', COALESCE(v_weekly_target, 0), 'weekly_completed', COALESCE(v_weekly_completed, 0),
    'pending_cancellations', COALESCE(v_pending, 0));
END;
$$;

COMMIT;
