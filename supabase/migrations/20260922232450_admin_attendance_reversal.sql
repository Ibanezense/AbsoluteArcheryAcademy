BEGIN;

ALTER TABLE public.student_credit_ledger
  DROP CONSTRAINT IF EXISTS student_credit_ledger_movement_type_check;

ALTER TABLE public.student_credit_ledger
  ADD CONSTRAINT student_credit_ledger_movement_type_check CHECK (
    movement_type IN (
      'membership_activation', 'booking_reserved', 'booking_cancelled_refund',
      'booking_cancelled_no_refund', 'booking_reservation_released',
      'attendance_consumed', 'weekly_no_show_consumed',
      'student_cancellation_no_show', 'recovery_granted', 'recovery_consumed',
      'no_show_reversal_refund',
      'admin_adjustment', 'reward_credit', 'migration_seed', 'migration_usage'
    )
  );

-- The historical index allowed only one ledger row per weekly event. Keep the
-- one-consumption invariant while allowing a separate, auditable refund row.
DROP INDEX IF EXISTS public.idx_student_credit_ledger_weekly_attendance;
CREATE UNIQUE INDEX idx_student_credit_ledger_weekly_attendance
  ON public.student_credit_ledger(weekly_attendance_id)
  WHERE weekly_attendance_id IS NOT NULL
    AND movement_type = 'weekly_no_show_consumed';

CREATE TABLE IF NOT EXISTS public.attendance_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  weekly_attendance_id uuid REFERENCES public.student_weekly_attendance(id) ON DELETE RESTRICT,
  original_ledger_id uuid NOT NULL REFERENCES public.student_credit_ledger(id) ON DELETE RESTRICT,
  refund_ledger_id uuid UNIQUE REFERENCES public.student_credit_ledger(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  reversed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  reversed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    ((booking_id IS NOT NULL)::integer + (weekly_attendance_id IS NOT NULL)::integer) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_reversals_booking_once
  ON public.attendance_reversals(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_reversals_weekly_once
  ON public.attendance_reversals(weekly_attendance_id)
  WHERE weekly_attendance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_student
  ON public.attendance_reversals(student_id, reversed_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_membership
  ON public.attendance_reversals(student_membership_id);

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_original_ledger
  ON public.attendance_reversals(original_ledger_id);

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_actor
  ON public.attendance_reversals(reversed_by_profile_id);

ALTER TABLE public.attendance_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_reversals_admin_read ON public.attendance_reversals;
CREATE POLICY attendance_reversals_admin_read
  ON public.attendance_reversals
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_user()));

REVOKE ALL ON TABLE public.attendance_reversals FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.attendance_reversals TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reverse_no_show(
  p_source text,
  p_event_id uuid,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_existing public.attendance_reversals;
  v_student_id uuid;
  v_membership_id uuid;
  v_original_ledger_id uuid;
  v_refund_ledger_id uuid;
  v_reversal_id uuid;
  v_balance_after integer;
  v_booking_id uuid;
  v_weekly_attendance_id uuid;
  v_credit_kind text := 'normal';
  v_recovery_credit_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden revertir inasistencias';
  END IF;

  IF p_source NOT IN ('booking', 'weekly') THEN
    RAISE EXCEPTION 'Origen de inasistencia no válido';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'La inasistencia es obligatoria';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo de la reversión es obligatorio';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud requiere una clave de idempotencia';
  END IF;

  SELECT reversal.*
  INTO v_existing
  FROM public.attendance_reversals reversal
  WHERE reversal.idempotency_key = p_request_id;

  IF v_existing.id IS NOT NULL THEN
    IF (p_source = 'booking' AND v_existing.booking_id IS DISTINCT FROM p_event_id)
      OR (p_source = 'weekly' AND v_existing.weekly_attendance_id IS DISTINCT FROM p_event_id)
    THEN
      RAISE EXCEPTION 'La clave de idempotencia pertenece a otra inasistencia';
    END IF;

    SELECT membership.classes_remaining
    INTO v_balance_after
    FROM public.student_memberships membership
    WHERE membership.id = v_existing.student_membership_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_reversed', true,
      'reversal_id', v_existing.id,
      'membership_id', v_existing.student_membership_id,
      'classes_remaining', v_balance_after
    );
  END IF;

  IF p_source = 'booking' THEN
    SELECT booking.student_id, booking.active_membership_id, booking.id,
      booking.credit_kind, booking.recovery_credit_id
    INTO v_student_id, v_membership_id, v_booking_id,
      v_credit_kind, v_recovery_credit_id
    FROM public.bookings booking
    WHERE booking.id = p_event_id
      AND booking.status = 'no_show'
      AND booking.student_id IS NOT NULL
      AND booking.active_membership_id IS NOT NULL
    FOR UPDATE;

    IF v_booking_id IS NULL THEN
      RAISE EXCEPTION 'La reserva no es una inasistencia reversible';
    END IF;

    SELECT ledger.id
    INTO v_original_ledger_id
    FROM public.student_credit_ledger ledger
    WHERE ledger.booking_id = v_booking_id
      AND ledger.student_id = v_student_id
      AND ledger.student_membership_id = v_membership_id
      AND ledger.movement_type = CASE
        WHEN v_credit_kind = 'recovery' THEN 'recovery_consumed'
        ELSE 'attendance_consumed'
      END
      AND ledger.delta = -1
    ORDER BY ledger.created_at ASC, ledger.id ASC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT attendance.student_id, attendance.student_membership_id, attendance.id
    INTO v_student_id, v_membership_id, v_weekly_attendance_id
    FROM public.student_weekly_attendance attendance
    WHERE attendance.id = p_event_id
      AND attendance.status = 'no_show'
      AND attendance.classes_consumed = 1
      AND attendance.student_membership_id IS NOT NULL
    FOR UPDATE;

    IF v_weekly_attendance_id IS NULL THEN
      RAISE EXCEPTION 'La inasistencia semanal no es reversible';
    END IF;

    SELECT ledger.id
    INTO v_original_ledger_id
    FROM public.student_credit_ledger ledger
    WHERE ledger.weekly_attendance_id = v_weekly_attendance_id
      AND ledger.student_id = v_student_id
      AND ledger.student_membership_id = v_membership_id
      AND ledger.movement_type = 'weekly_no_show_consumed'
      AND ledger.delta = -1
    ORDER BY ledger.created_at ASC, ledger.id ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_original_ledger_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el consumo original de la inasistencia';
  END IF;

  SELECT reversal.*
  INTO v_existing
  FROM public.attendance_reversals reversal
  WHERE reversal.idempotency_key = p_request_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF (p_source = 'booking' AND v_existing.booking_id IS DISTINCT FROM p_event_id)
      OR (p_source = 'weekly' AND v_existing.weekly_attendance_id IS DISTINCT FROM p_event_id)
    THEN
      RAISE EXCEPTION 'La clave de idempotencia pertenece a otra inasistencia';
    END IF;

    SELECT membership.classes_remaining
    INTO v_balance_after
    FROM public.student_memberships membership
    WHERE membership.id = v_existing.student_membership_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_reversed', true,
      'reversal_id', v_existing.id,
      'membership_id', v_existing.student_membership_id,
      'classes_remaining', v_balance_after
    );
  END IF;

  SELECT reversal.*
  INTO v_existing
  FROM public.attendance_reversals reversal
  WHERE (v_booking_id IS NOT NULL AND reversal.booking_id = v_booking_id)
     OR (v_weekly_attendance_id IS NOT NULL AND reversal.weekly_attendance_id = v_weekly_attendance_id)
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'La inasistencia ya fue revertida';
  END IF;

  IF v_credit_kind = 'recovery' THEN
    UPDATE public.membership_recovery_credits recovery
    SET
      classes_remaining = LEAST(classes_remaining + 1, classes_granted),
      updated_at = now()
    WHERE recovery.id = v_recovery_credit_id
      AND recovery.student_membership_id = v_membership_id
    RETURNING recovery.classes_remaining INTO v_balance_after;
  ELSE
    UPDATE public.student_memberships membership
    SET
      classes_used = GREATEST(classes_used - 1, 0),
      classes_remaining = classes_remaining + 1,
      status = CASE
        WHEN status IN ('expired', 'consumed')
          AND expiration_reason = 'no_classes_remaining'
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
        THEN 'active'
        ELSE status
      END,
      expired_at = CASE
        WHEN status IN ('expired', 'consumed')
          AND expiration_reason = 'no_classes_remaining'
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
        THEN NULL
        ELSE expired_at
      END,
      expiration_reason = CASE
        WHEN status IN ('expired', 'consumed')
          AND expiration_reason = 'no_classes_remaining'
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Lima')::date)
        THEN NULL
        ELSE expiration_reason
      END,
      updated_at = now()
    WHERE membership.id = v_membership_id
      AND membership.student_id = v_student_id
    RETURNING membership.classes_remaining INTO v_balance_after;
  END IF;

  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'El crédito debitado ya no existe';
  END IF;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    weekly_attendance_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  ) VALUES (
    v_student_id,
    v_membership_id,
    v_booking_id,
    v_weekly_attendance_id,
    'no_show_reversal_refund',
    1,
    v_balance_after,
    format('Inasistencia revertida: %s', btrim(p_reason)),
    v_actor_id,
    now()
  )
  RETURNING id INTO v_refund_ledger_id;

  INSERT INTO public.attendance_reversals (
    student_id,
    student_membership_id,
    booking_id,
    weekly_attendance_id,
    original_ledger_id,
    refund_ledger_id,
    reason,
    reversed_by_profile_id,
    idempotency_key,
    reversed_at
  ) VALUES (
    v_student_id,
    v_membership_id,
    v_booking_id,
    v_weekly_attendance_id,
    v_original_ledger_id,
    v_refund_ledger_id,
    btrim(p_reason),
    v_actor_id,
    p_request_id,
    now()
  )
  RETURNING id INTO v_reversal_id;

  PERFORM public.sync_student_membership_operational_status(v_student_id);

  RETURN jsonb_build_object(
    'success', true,
    'already_reversed', false,
    'reversal_id', v_reversal_id,
    'membership_id', v_membership_id,
    'classes_remaining', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) IS
  'Revierte una inasistencia de reserva o semanal, devuelve exactamente un crédito y conserva auditoría administrativa.';

COMMIT;
