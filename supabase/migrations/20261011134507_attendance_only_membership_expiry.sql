-- Attendance-only policy. Existing expired history remains untouched.
ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS attendance_policy_started_on date,
  ADD COLUMN IF NOT EXISTS unused_classes_finalized_at timestamptz;
UPDATE public.student_memberships
SET attendance_policy_started_on = (now() AT TIME ZONE 'America/Lima')::date
WHERE attendance_policy_started_on IS NULL AND status = 'active'
  AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date);
ALTER TABLE public.student_memberships ALTER COLUMN attendance_policy_started_on
  SET DEFAULT ((now() AT TIME ZONE 'America/Lima')::date);

CREATE TABLE public.membership_class_expirations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid NOT NULL UNIQUE REFERENCES public.student_memberships(id) ON DELETE CASCADE,
  normal_classes integer NOT NULL CHECK (normal_classes >= 0),
  recovery_classes integer NOT NULL CHECK (recovery_classes >= 0),
  expired_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (normal_classes + recovery_classes > 0)
);
CREATE INDEX idx_membership_expirations_student ON public.membership_class_expirations(student_id);
ALTER TABLE public.membership_class_expirations ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_class_expirations_read ON public.membership_class_expirations
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));
GRANT SELECT ON public.membership_class_expirations TO authenticated;
REVOKE ALL ON public.membership_class_expirations FROM anon;
GRANT ALL ON public.membership_class_expirations TO service_role;

ALTER TABLE public.student_credit_ledger ADD COLUMN expiration_event_id uuid
  REFERENCES public.membership_class_expirations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_ledger_membership_expiration_once ON public.student_credit_ledger(expiration_event_id)
  WHERE expiration_event_id IS NOT NULL;
ALTER TABLE public.student_credit_ledger DROP CONSTRAINT student_credit_ledger_movement_type_check;
ALTER TABLE public.student_credit_ledger ADD CONSTRAINT student_credit_ledger_movement_type_check CHECK (
  movement_type IN ('membership_activation','booking_reserved','booking_cancelled_refund',
    'booking_cancelled_no_refund','booking_reservation_released','attendance_consumed',
    'weekly_no_show_consumed','student_cancellation_no_show','recovery_granted','recovery_consumed',
    'no_show_reversal_refund','admin_adjustment','reward_credit','migration_seed','migration_usage',
    'membership_classes_expired')
);
ALTER TABLE public.booking_cancellations DROP CONSTRAINT booking_cancellations_cancellation_source_check;
ALTER TABLE public.booking_cancellations ADD CONSTRAINT booking_cancellations_cancellation_source_check
  CHECK (cancellation_source IN ('student','academy','membership_freeze','day_end','membership_expiry'));

-- Protect definitive expirations even from legacy refund / extension RPCs.
CREATE OR REPLACE FUNCTION public.protect_finalized_membership_classes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.unused_classes_finalized_at IS NOT NULL AND (
    NEW.classes_remaining IS DISTINCT FROM OLD.classes_remaining
    OR NEW.classes_used IS DISTINCT FROM OLD.classes_used
    OR NEW.classes_total IS DISTINCT FROM OLD.classes_total
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.unused_classes_finalized_at IS DISTINCT FROM OLD.unused_classes_finalized_at
    OR NEW.attendance_policy_started_on IS DISTINCT FROM OLD.attendance_policy_started_on
  ) THEN
    RAISE EXCEPTION 'Las clases vencidas son no recuperables; crea una nueva membresía';
  END IF;
  IF OLD.attendance_policy_started_on IS NOT NULL AND
    NEW.attendance_policy_started_on IS DISTINCT FROM OLD.attendance_policy_started_on THEN
    RAISE EXCEPTION 'La política de asistencia de la membresía no puede eliminarse';
  END IF;
  IF OLD.attendance_policy_started_on IS NOT NULL
    AND OLD.end_date < (now() AT TIME ZONE 'America/Lima')::date
    AND (NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.classes_remaining > OLD.classes_remaining) THEN
    RAISE EXCEPTION 'El periodo terminó; las clases pendientes no se pueden recuperar';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_finalized_membership_classes BEFORE UPDATE ON public.student_memberships
FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_membership_classes();

-- Every entry point, including old client versions, must reject a new no-show.
CREATE OR REPLACE FUNCTION public.reject_new_no_show()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'student_weekly_attendance' THEN
    RAISE EXCEPTION 'Ya no se registran inasistencias semanales';
  END IF;
  IF NEW.status = 'no_show' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Solo se registra asistencia; las reservas pendientes se cancelan al cerrar el día';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_new_booking_no_show BEFORE INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.reject_new_no_show();
CREATE TRIGGER reject_new_weekly_no_show BEFORE INSERT ON public.student_weekly_attendance
FOR EACH ROW EXECUTE FUNCTION public.reject_new_no_show();

CREATE OR REPLACE FUNCTION public.reject_new_recovery_credit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Las clases pendientes no se trasladan ni se recuperan en otro periodo';
END;
$$;
CREATE TRIGGER reject_new_recovery_credit BEFORE INSERT ON public.membership_recovery_credits
FOR EACH ROW EXECUTE FUNCTION public.reject_new_recovery_credit();

CREATE OR REPLACE FUNCTION public.protect_existing_recovery_credit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_receiver public.student_memberships;
BEGIN
  IF NEW.student_membership_id IS DISTINCT FROM OLD.student_membership_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.source_membership_id IS DISTINCT FROM OLD.source_membership_id
    OR NEW.classes_granted IS DISTINCT FROM OLD.classes_granted THEN
    RAISE EXCEPTION 'Las recuperaciones existentes no pueden trasladarse ni aumentarse';
  END IF;
  SELECT * INTO v_receiver FROM public.student_memberships WHERE id=OLD.student_membership_id;
  IF NEW.classes_remaining > OLD.classes_remaining AND v_receiver.attendance_policy_started_on IS NOT NULL
    AND (v_receiver.unused_classes_finalized_at IS NOT NULL
      OR v_receiver.end_date < (now() AT TIME ZONE 'America/Lima')::date) THEN
    RAISE EXCEPTION 'Las clases vencidas son no recuperables';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_existing_recovery_credit BEFORE UPDATE ON public.membership_recovery_credits
FOR EACH ROW EXECUTE FUNCTION public.protect_existing_recovery_credit();

-- Internal operation: cancel a pending booking without credit consumption or refund.
CREATE OR REPLACE FUNCTION public.close_pending_booking(p_booking_id uuid, p_source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking public.bookings; v_reason text;
BEGIN
  IF p_source NOT IN ('day_end','membership_expiry') THEN RAISE EXCEPTION 'Origen inválido'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'reserved' THEN RETURN false; END IF;
  v_reason := CASE WHEN p_source = 'day_end'
    THEN 'Reserva cancelada al cerrar el día: asistencia no registrada. Crédito conservado.'
    ELSE 'Reserva cancelada por vencimiento de membresía. Clase no recuperable.' END;
  UPDATE public.bookings SET status = 'cancelled',
    admin_notes = concat_ws(E'\n', NULLIF(admin_notes,''), v_reason), updated_at = now()
  WHERE id = p_booking_id AND status = 'reserved';
  INSERT INTO public.booking_cancellations (booking_id, student_id, cancellation_source, review_status, admin_reason)
  VALUES (p_booking_id, v_booking.student_id, p_source, 'not_required', v_reason)
  ON CONFLICT (booking_id) DO NOTHING;
  PERFORM public.release_booking_resources(p_booking_id, p_source);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.close_pending_booking(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_pending_booking(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.close_unattended_daily_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking_id uuid; v_count integer := 0; v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  FOR v_booking_id IN
    SELECT b.id FROM public.bookings b
    JOIN public.sessions s ON s.id = b.session_id
    JOIN public.student_memberships m ON m.id = b.active_membership_id
    WHERE b.status = 'reserved' AND b.student_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.finalize_unused_membership_classes(p_student_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_membership public.student_memberships; v_booking_id uuid; v_expiration_id uuid;
  v_recovery integer; v_count integer := 0; v_locked_recoveries integer;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date; v_expired_at timestamptz;
BEGIN
  FOR v_membership IN
    SELECT * FROM public.student_memberships
    WHERE (p_student_id IS NULL OR student_id = p_student_id)
      AND attendance_policy_started_on IS NOT NULL AND unused_classes_finalized_at IS NULL
      AND status IN ('active','expired') AND end_date < v_today
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    -- Release every pending commitment before zeroing the receiving cycle.
    FOR v_booking_id IN SELECT id FROM public.bookings
      WHERE active_membership_id = v_membership.id AND status = 'reserved' ORDER BY id FOR UPDATE SKIP LOCKED
    LOOP PERFORM public.close_pending_booking(v_booking_id,'membership_expiry'); END LOOP;
    -- A booking being marked/cancelled by another transaction must finish first.
    -- Leave this cycle for the next scheduled run instead of reversing lock order.
    IF EXISTS (SELECT 1 FROM public.bookings
      WHERE active_membership_id=v_membership.id AND status='reserved') THEN CONTINUE; END IF;

    PERFORM 1 FROM public.membership_recovery_credits
      WHERE student_membership_id = v_membership.id ORDER BY id FOR UPDATE SKIP LOCKED;
    GET DIAGNOSTICS v_locked_recoveries = ROW_COUNT;
    IF v_locked_recoveries <> (SELECT count(*) FROM public.membership_recovery_credits
      WHERE student_membership_id = v_membership.id) THEN CONTINUE; END IF;
    SELECT COALESCE(SUM(classes_remaining),0)::integer INTO v_recovery
      FROM public.membership_recovery_credits WHERE student_membership_id = v_membership.id;
    v_expired_at := ((v_membership.end_date + 1)::timestamp AT TIME ZONE 'America/Lima');
    IF v_membership.classes_remaining + v_recovery > 0 THEN
      INSERT INTO public.membership_class_expirations
        (student_id,student_membership_id,normal_classes,recovery_classes,expired_at)
      VALUES (v_membership.student_id,v_membership.id,v_membership.classes_remaining,v_recovery,v_expired_at)
      RETURNING id INTO v_expiration_id;
      INSERT INTO public.student_credit_ledger
        (student_id,student_membership_id,expiration_event_id,movement_type,delta,balance_after,reason)
      VALUES (v_membership.student_id,v_membership.id,v_expiration_id,'membership_classes_expired',
        -(v_membership.classes_remaining + v_recovery),0,'No asistidas · No recuperables por vencimiento de membresía');
    END IF;
    UPDATE public.membership_recovery_credits SET classes_remaining = 0,updated_at = now()
      WHERE student_membership_id = v_membership.id AND classes_remaining > 0;
    UPDATE public.student_memberships SET classes_remaining = 0,status = 'expired',
      expired_at = v_expired_at, expiration_reason = 'end_date',
      unused_classes_finalized_at = v_expired_at,updated_at = now()
    WHERE id = v_membership.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_unused_membership_classes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_unused_membership_classes(uuid) TO service_role;

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

  IF EXISTS (
    SELECT 1 FROM public.student_memberships m JOIN public.sessions s ON s.id=v_booking.session_id
    WHERE m.id=v_booking.active_membership_id AND m.attendance_policy_started_on IS NOT NULL
      AND (s.start_at AT TIME ZONE 'America/Lima')::date >= m.attendance_policy_started_on
      AND (s.start_at AT TIME ZONE 'America/Lima')::date < (now() AT TIME ZONE 'America/Lima')::date
  ) THEN RAISE EXCEPTION 'El día terminó; esta reserva se cancela sin descontar crédito'; END IF;

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
CREATE OR REPLACE FUNCTION public.sync_student_membership_operational_status(p_student_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now_lima timestamp := now() AT TIME ZONE 'America/Lima';
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_row_count integer := 0;
  v_total_changed integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    (p_student_id IS NULL AND NOT public.is_admin_user())
    OR (p_student_id IS NOT NULL AND NOT public.can_access_student(p_student_id))
  ) THEN
    RAISE EXCEPTION 'No tienes acceso al alumno indicado';
  END IF;
  v_total_changed := public.finalize_unused_membership_classes(p_student_id);
  UPDATE public.student_memberships
  SET status = 'expired',
      expired_at = COALESCE(expired_at, public.membership_end_date_expired_at(end_date)),
      expiration_reason = COALESCE(expiration_reason, 'end_date'),
      classes_remaining = GREATEST(COALESCE(classes_remaining, 0), 0), updated_at = now()
  WHERE (p_student_id IS NULL OR student_id = p_student_id)
    AND status = 'active' AND end_date IS NOT NULL AND end_date < v_today
    AND attendance_policy_started_on IS NULL;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  UPDATE public.student_memberships membership
  SET status = 'expired', expired_at = COALESCE(expired_at, now()),
      expiration_reason = COALESCE(expiration_reason, 'no_classes_remaining'),
      classes_remaining = 0, updated_at = now()
  WHERE (p_student_id IS NULL OR membership.student_id = p_student_id)
    AND membership.status = 'active'
    AND membership.classes_remaining <= 0
    AND NOT EXISTS (
      SELECT 1 FROM public.membership_recovery_credits recovery
      WHERE recovery.student_membership_id = membership.id
        AND recovery.classes_remaining > 0
    );
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  WITH target_students AS (
    SELECT student.id, student.is_active, student.operational_status
    FROM public.students student
    WHERE p_student_id IS NULL OR student.id = p_student_id
  ), computed AS (
    SELECT target.id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.student_memberships membership
          WHERE membership.student_id = target.id AND membership.status = 'active'
            AND membership.start_date <= v_today
            AND (membership.end_date IS NULL OR membership.end_date >= v_today)
            AND (
              COALESCE(membership.classes_remaining, 0) > 0
              OR EXISTS (SELECT 1 FROM public.membership_recovery_credits recovery
                WHERE recovery.student_membership_id = membership.id AND recovery.classes_remaining > 0)
            )
        ) THEN 'active'
        WHEN EXISTS (
          SELECT 1 FROM public.student_memberships membership
          WHERE membership.student_id = target.id AND membership.status = 'active'
            AND membership.start_date > v_today
            AND (
              COALESCE(membership.classes_remaining, 0) > 0
              OR EXISTS (SELECT 1 FROM public.membership_recovery_credits recovery
                WHERE recovery.student_membership_id = membership.id AND recovery.classes_remaining > 0)
            )
        ) THEN 'paused'
        WHEN latest_expired.id IS NOT NULL AND v_now_lima >= (
          COALESCE(latest_expired.expired_at,
            public.membership_end_date_expired_at(latest_expired.end_date),
            latest_expired.updated_at, latest_expired.created_at) AT TIME ZONE 'America/Lima'
        ) + interval '14 days' THEN 'paused'
        WHEN latest_expired.id IS NOT NULL THEN 'expired'
        WHEN EXISTS (SELECT 1 FROM public.student_memberships any_membership
          WHERE any_membership.student_id = target.id) THEN 'paused'
        WHEN COALESCE(target.is_active, false) THEN 'active'
        ELSE 'paused'
      END AS next_status
    FROM target_students target
    LEFT JOIN LATERAL (
      SELECT membership.* FROM public.student_memberships membership
      WHERE membership.student_id = target.id AND membership.status = 'expired'
      ORDER BY COALESCE(membership.expired_at,
        public.membership_end_date_expired_at(membership.end_date),
        membership.updated_at, membership.created_at) DESC,
        membership.created_at DESC, membership.id DESC
      LIMIT 1
    ) latest_expired ON true
  )
  UPDATE public.students student SET
    operational_status = computed.next_status,
    operational_status_reason = CASE computed.next_status
      WHEN 'active' THEN 'Membresia vigente con saldo normal o recuperacion disponible'
      WHEN 'expired' THEN 'Membresia expirada dentro del periodo de seguimiento'
      ELSE 'Sin membresia vigente con saldo disponible'
    END,
    operational_status_updated_at = now(), is_active = computed.next_status = 'active', updated_at = now()
  FROM computed
  WHERE student.id = computed.id
    AND NOT public.is_student_protected_operational_status(student.operational_status)
    AND (student.operational_status IS DISTINCT FROM computed.next_status
      OR student.is_active IS DISTINCT FROM (computed.next_status = 'active'));
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_total_changed + v_row_count;
END;
$function$
;

-- Authenticated history combines real events and lost credits without inventing sessions.
CREATE OR REPLACE FUNCTION public.get_student_attendance_history(
  p_student_id uuid DEFAULT NULL, page_number integer DEFAULT 1, page_size integer DEFAULT 10
)
RETURNS TABLE (
  booking_id uuid,start_at timestamptz,status text,distance_m integer,bow_usage_type text,
  student_membership_id uuid,membership_code text,note text,event_source text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student_id uuid;
BEGIN
  IF page_number IS NULL OR page_number < 1 OR page_size IS NULL OR page_size < 1 OR page_size > 100 THEN
    RAISE EXCEPTION 'Paginación inválida';
  END IF;
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  RETURN QUERY
  WITH history AS (
    SELECT b.id,s.start_at,b.status::text,b.distance_m,b.bow_usage_type::text,
      b.active_membership_id,m.membership_code,b.admin_notes,'booking'::text
    FROM public.bookings b JOIN public.sessions s ON s.id=b.session_id
      LEFT JOIN public.student_memberships m ON m.id=b.active_membership_id
    WHERE b.student_id=v_student_id
      AND NOT EXISTS (SELECT 1 FROM public.attendance_reversals r WHERE r.booking_id=b.id)
    UNION ALL
    SELECT w.id, w.week_end::timestamp AT TIME ZONE 'America/Lima','no_show',NULL::integer,NULL::text,
      w.student_membership_id,m.membership_code,COALESCE(w.note,'Inasistencia semanal histórica'),'weekly'::text
    FROM public.student_weekly_attendance w
      LEFT JOIN public.student_memberships m ON m.id=w.student_membership_id
    WHERE w.student_id=v_student_id
      AND NOT EXISTS (SELECT 1 FROM public.attendance_reversals r WHERE r.weekly_attendance_id=w.id)
    UNION ALL
    SELECT md5(e.id::text || ':' || slot.n::text)::uuid, e.expired_at - interval '1 second',
      'expired_unattended',NULL::integer,NULL::text,e.student_membership_id,m.membership_code,
      'No recuperable. Clase pendiente al finalizar el periodo de membresía.','expiry'::text
    FROM public.membership_class_expirations e
      JOIN public.student_memberships m ON m.id=e.student_membership_id
      CROSS JOIN LATERAL generate_series(1,e.normal_classes+e.recovery_classes) slot(n)
    WHERE e.student_id=v_student_id
  )
  SELECT * FROM history ORDER BY history.start_at DESC,history.id DESC
  LIMIT page_size OFFSET (page_number-1)*page_size;
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_attendance_history(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_attendance_history(uuid,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_attendance_day_close()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cancelled integer; v_changed integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('attendance-day-close'));
  v_changed := public.sync_student_membership_operational_status(NULL);
  v_cancelled := public.close_unattended_daily_bookings();
  RETURN jsonb_build_object('cancelled',v_cancelled,'memberships_and_students_changed',v_changed);
END;
$$;
REVOKE ALL ON FUNCTION public.run_attendance_day_close() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_attendance_day_close() TO service_role;

-- Runs at 00:00 Lima and retries every hour; selectors only affect finished days.
-- Supabase cron uses UTC. It runs without a web session or an open admin page.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('attendance-day-close-lima','0 * * * *','SELECT public.run_attendance_day_close();');

REVOKE ALL ON FUNCTION public.admin_mark_attendance(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_attendance(uuid,boolean) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO authenticated,service_role;
