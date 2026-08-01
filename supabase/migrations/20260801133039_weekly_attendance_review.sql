-- ============================================================================
-- Weekly attendance review (Thursday through Sunday)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_weekly_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id) ON DELETE RESTRICT,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'no_show' CHECK (status = 'no_show'),
  classes_consumed integer NOT NULL DEFAULT 1 CHECK (classes_consumed = 1),
  marked_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_weekly_attendance_valid_window CHECK (week_end = week_start + 3),
  CONSTRAINT student_weekly_attendance_student_week_unique UNIQUE (student_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_student_weekly_attendance_student_history
  ON public.student_weekly_attendance(student_id, week_end DESC);

ALTER TABLE public.student_weekly_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_weekly_attendance_select ON public.student_weekly_attendance;
CREATE POLICY student_weekly_attendance_select
  ON public.student_weekly_attendance
  FOR SELECT
  TO authenticated
  USING (public.can_access_student(student_id));

REVOKE ALL ON TABLE public.student_weekly_attendance FROM anon;
GRANT SELECT ON TABLE public.student_weekly_attendance TO authenticated, service_role;

ALTER TABLE public.student_credit_ledger
  ADD COLUMN IF NOT EXISTS weekly_attendance_id uuid
    REFERENCES public.student_weekly_attendance(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_credit_ledger_weekly_attendance
  ON public.student_credit_ledger(weekly_attendance_id)
  WHERE weekly_attendance_id IS NOT NULL;

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
      'weekly_no_show_consumed',
      'admin_adjustment',
      'reward_credit',
      'migration_seed',
      'migration_usage'
    )
  );

CREATE OR REPLACE FUNCTION public.get_weekly_attendance_review(p_sunday date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_pending_count integer := 0;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden revisar inasistencias semanales';
  END IF;

  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RETURN jsonb_build_object(
      'is_sunday', false,
      'week_start', NULL,
      'week_end', p_sunday,
      'pending_count', 0,
      'candidates', '[]'::jsonb
    );
  END IF;

  v_week_start := p_sunday - 3;

  SELECT COUNT(*)::integer
  INTO v_pending_count
  FROM public.bookings pending_booking
  INNER JOIN public.sessions pending_session
    ON pending_session.id = pending_booking.session_id
  WHERE pending_booking.status = 'reserved'
    AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
      BETWEEN v_week_start AND p_sunday;

  IF v_pending_count = 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'student_id', candidate.student_id,
          'student_name', candidate.student_name,
          'avatar_url', candidate.avatar_url,
          'membership_id', candidate.membership_id,
          'membership_name', candidate.membership_name,
          'membership_end', candidate.membership_end,
          'classes_remaining', candidate.classes_remaining,
          'membership_display_status', candidate.membership_display_status
        )
        ORDER BY candidate.student_name
      ),
      '[]'::jsonb
    )
    INTO v_candidates
    FROM (
      SELECT
        st.id AS student_id,
        st.full_name AS student_name,
        st.avatar_url,
        sm.id AS membership_id,
        sm.custom_name AS membership_name,
        sm.end_date AS membership_end,
        sm.classes_remaining,
        CASE
          WHEN sm.end_date IS NOT NULL AND sm.end_date <= p_sunday + 7
            THEN 'expiring'
          ELSE 'active'
        END AS membership_display_status
      FROM public.students st
      INNER JOIN public.student_memberships sm
        ON sm.student_id = st.id
      WHERE st.is_active = true
        AND COALESCE(st.operational_status, '') NOT IN ('retired', 'withdrawn', 'blocked', 'suspended')
        AND sm.status = 'active'
        AND sm.classes_remaining > 0
        AND sm.start_date <= p_sunday
        AND (sm.end_date IS NULL OR sm.end_date >= p_sunday)
        AND NOT EXISTS (
          SELECT 1
          FROM public.bookings b
          INNER JOIN public.sessions s ON s.id = b.session_id
          WHERE b.student_id = st.id
            AND b.status = 'attended'
            AND (s.start_at AT TIME ZONE 'America/Lima')::date
              BETWEEN v_week_start AND p_sunday
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.student_weekly_attendance swa
          WHERE swa.student_id = st.id
            AND swa.week_start = v_week_start
        )
    ) candidate;
  END IF;

  RETURN jsonb_build_object(
    'is_sunday', true,
    'week_start', v_week_start,
    'week_end', p_sunday,
    'pending_count', v_pending_count,
    'candidates', v_candidates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_attendance_review(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_weekly_no_show(
  p_student_id uuid,
  p_sunday date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_student_id uuid;
  v_membership public.student_memberships;
  v_existing_id uuid;
  v_weekly_attendance_id uuid;
  v_balance_after integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar inasistencias semanales';
  END IF;

  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RAISE EXCEPTION 'La revisión semanal solo puede registrarse para un domingo';
  END IF;

  v_week_start := p_sunday - 3;

  SELECT st.id
  INTO v_student_id
  FROM public.students st
  WHERE st.id = p_student_id
    AND st.is_active = true
    AND COALESCE(st.operational_status, '') NOT IN ('retired', 'withdrawn', 'blocked', 'suspended')
  FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado o no elegible';
  END IF;

  SELECT swa.id
  INTO v_existing_id
  FROM public.student_weekly_attendance swa
  WHERE swa.student_id = p_student_id
    AND swa.week_start = v_week_start;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings pending_booking
    INNER JOIN public.sessions pending_session
      ON pending_session.id = pending_booking.session_id
    WHERE pending_booking.status = 'reserved'
      AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_week_start AND p_sunday
  ) THEN
    RAISE EXCEPTION 'Primero completa las asistencias pendientes de jueves a domingo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings attendance_booking
    INNER JOIN public.sessions attendance_session
      ON attendance_session.id = attendance_booking.session_id
    WHERE attendance_booking.student_id = p_student_id
      AND attendance_booking.status = 'attended'
      AND (attendance_session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_week_start AND p_sunday
  ) THEN
    RAISE EXCEPTION 'El alumno registra al menos una asistencia esta semana';
  END IF;

  SELECT sm.*
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND sm.classes_remaining > 0
    AND sm.start_date <= p_sunday
    AND (sm.end_date IS NULL OR sm.end_date >= p_sunday)
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership.id IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresía vigente con clases disponibles';
  END IF;

  INSERT INTO public.student_weekly_attendance (
    student_id,
    student_membership_id,
    week_start,
    week_end,
    status,
    classes_consumed,
    marked_by_profile_id,
    marked_at,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_week_start,
    p_sunday,
    'no_show',
    1,
    v_actor_id,
    now(),
    now()
  )
  ON CONFLICT (student_id, week_start) DO NOTHING
  RETURNING id INTO v_weekly_attendance_id;

  IF v_weekly_attendance_id IS NULL THEN
    SELECT swa.id
    INTO v_existing_id
    FROM public.student_weekly_attendance swa
    WHERE swa.student_id = p_student_id
      AND swa.week_start = v_week_start;

    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id
    );
  END IF;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    weekly_attendance_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_weekly_attendance_id,
    'weekly_no_show_consumed',
    -1,
    v_balance_after,
    format('Clase consumida por inasistencia semanal del %s al %s', v_week_start, p_sunday),
    v_actor_id,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_marked', false,
    'weekly_attendance_id', v_weekly_attendance_id,
    'classes_remaining', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) TO authenticated, service_role;

COMMENT ON TABLE public.student_weekly_attendance IS
  'Inasistencias semanales auditables para la ventana deportiva de jueves a domingo.';

COMMENT ON FUNCTION public.get_weekly_attendance_review(date) IS
  'Devuelve los alumnos elegibles sin asistencia entre jueves y domingo una vez cerrado el roster semanal.';

COMMENT ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) IS
  'Registra una inasistencia semanal idempotente y consume exactamente una clase de la membresía vigente.';
