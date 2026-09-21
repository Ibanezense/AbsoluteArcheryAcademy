-- Keep the weekly review and its debit operation on the same Monday-Sunday window.
ALTER TABLE public.student_weekly_attendance
  DROP CONSTRAINT IF EXISTS student_weekly_attendance_valid_window;

UPDATE public.student_weekly_attendance
SET week_start = week_end - 6
WHERE week_start = week_end - 3;

ALTER TABLE public.student_weekly_attendance
  ADD CONSTRAINT student_weekly_attendance_valid_window
  CHECK (week_end = week_start + 6);

WITH classified_plans AS (
  SELECT
    id,
    lower(trim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) AS normalized_name
  FROM public.membership_plans
)
UPDATE public.membership_plans AS plan
SET weekly_class_target = CASE
  WHEN classified.normalized_name = '1 clase por semana - afiliados country' THEN 1
  WHEN classified.normalized_name = '2 clases por semana - afiliados country' THEN 2
  ELSE plan.weekly_class_target
END
FROM classified_plans AS classified
WHERE plan.id = classified.id
  AND classified.normalized_name IN (
    '1 clase por semana - afiliados country',
    '2 clases por semana - afiliados country'
  );

UPDATE public.student_memberships AS membership
SET weekly_class_target = plan.weekly_class_target
FROM public.membership_plans AS plan
WHERE membership.membership_plan_id = plan.id
  AND lower(trim(regexp_replace(plan.name, '[[:space:]]+', ' ', 'g'))) IN (
    '1 clase por semana - afiliados country',
    '2 clases por semana - afiliados country'
  )
  AND membership.weekly_class_target IS DISTINCT FROM plan.weekly_class_target;

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
  v_pending_count integer;
  v_candidates jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
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
  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede revisar una semana futura';
  END IF;

  v_week_start := p_sunday - 6;

  SELECT COUNT(*)::integer INTO v_pending_count
  FROM public.bookings AS booking
  JOIN public.sessions AS session ON session.id = booking.session_id
  WHERE booking.status = 'reserved'
    AND booking.student_id IS NOT NULL
    AND (session.start_at AT TIME ZONE 'America/Lima')::date
      BETWEEN v_week_start AND p_sunday;

  WITH cancellation_candidates AS (
    SELECT
      cancellation.student_id,
      student.full_name AS student_name,
      student.avatar_url,
      booking.active_membership_id AS membership_id,
      membership.custom_name AS membership_name,
      membership.end_date AS membership_end,
      membership.classes_remaining,
      membership.classes_remaining AS membership_available_classes,
      membership.classes_remaining AS available_classes,
      CASE WHEN membership.end_date <= p_sunday + 7 THEN 'expiring' ELSE 'active' END
        AS membership_display_status,
      membership.weekly_class_target,
      0::integer AS attended_count,
      0::integer AS booking_no_show_count,
      0::integer AS weekly_no_show_count,
      0::integer AS completed_count,
      0::integer AS neutralized_cancellation_count,
      1::integer AS missing_count,
      'student_cancellation'::text AS candidate_type,
      cancellation.id AS cancellation_id,
      booking.id AS booking_id,
      session.start_at,
      location.name AS location_name
    FROM public.booking_cancellations AS cancellation
    JOIN public.bookings AS booking ON booking.id = cancellation.booking_id
    JOIN public.sessions AS session ON session.id = booking.session_id
    JOIN public.academy_locations AS location ON location.id = session.location_id
    JOIN public.students AS student ON student.id = cancellation.student_id
    JOIN public.student_memberships AS membership ON membership.id = booking.active_membership_id
    WHERE cancellation.cancellation_source = 'student'
      AND cancellation.review_status = 'pending'
      AND (session.start_at AT TIME ZONE location.timezone)::date
        BETWEEN v_week_start AND p_sunday
  ), quota_candidates AS (
    SELECT
      student.id AS student_id,
      student.full_name AS student_name,
      student.avatar_url,
      membership.id AS membership_id,
      membership.custom_name AS membership_name,
      membership.end_date AS membership_end,
      membership.classes_remaining,
      membership.classes_remaining AS membership_available_classes,
      membership.classes_remaining AS available_classes,
      CASE WHEN membership.end_date <= p_sunday + 7 THEN 'expiring' ELSE 'active' END
        AS membership_display_status,
      membership.weekly_class_target,
      counts.attended_count,
      counts.booking_no_show_count,
      counts.weekly_no_show_count,
      counts.completed_count,
      counts.neutralized_cancellation_count,
      LEAST(
        GREATEST(
          membership.weekly_class_target
            - counts.completed_count
            - counts.neutralized_cancellation_count,
          0
        ),
        membership.classes_remaining
      )::integer AS missing_count,
      'unreserved_quota'::text AS candidate_type,
      NULL::uuid AS cancellation_id,
      NULL::uuid AS booking_id,
      NULL::timestamptz AS start_at,
      NULL::text AS location_name
    FROM public.students AS student
    JOIN LATERAL (
      SELECT sm.*
      FROM public.student_memberships AS sm
      WHERE sm.student_id = student.id
        AND sm.status = 'active'
        AND sm.weekly_class_target > 0
        AND sm.start_date <= v_week_start
        AND (sm.end_date IS NULL OR sm.end_date >= p_sunday)
        AND NOT EXISTS (
          SELECT 1
          FROM public.membership_freezes AS membership_freeze
          WHERE membership_freeze.membership_purchase_id = sm.purchase_id
            AND membership_freeze.status <> 'cancelled'
            AND daterange(membership_freeze.start_date, membership_freeze.end_date, '[]')
              && daterange(v_week_start, p_sunday, '[]')
        )
      ORDER BY sm.start_date, sm.created_at, sm.id
      LIMIT 1
    ) AS membership ON true
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE booking.status = 'attended')::integer AS attended_count,
        COUNT(*) FILTER (WHERE booking.status = 'no_show')::integer AS booking_no_show_count,
        (
          SELECT COUNT(*)::integer
          FROM public.student_weekly_attendance AS weekly_attendance
          WHERE weekly_attendance.student_id = student.id
            AND weekly_attendance.week_start = v_week_start
            AND weekly_attendance.status = 'no_show'
        ) AS weekly_no_show_count,
        COUNT(*) FILTER (WHERE booking.status IN ('attended', 'no_show'))::integer
          + (
            SELECT COUNT(*)::integer
            FROM public.student_weekly_attendance AS weekly_attendance
            WHERE weekly_attendance.student_id = student.id
              AND weekly_attendance.week_start = v_week_start
              AND weekly_attendance.status = 'no_show'
          ) AS completed_count,
        COUNT(*) FILTER (
          WHERE cancellation.cancellation_source IN ('academy', 'membership_freeze')
            OR (
              cancellation.cancellation_source = 'student'
              AND (
                cancellation.review_status = 'pending'
                OR cancellation.resolution = 'justified'
              )
            )
        )::integer AS neutralized_cancellation_count
      FROM public.bookings AS booking
      JOIN public.sessions AS session ON session.id = booking.session_id
      LEFT JOIN public.booking_cancellations AS cancellation
        ON cancellation.booking_id = booking.id
      WHERE booking.student_id = student.id
        AND (session.start_at AT TIME ZONE 'America/Lima')::date
          BETWEEN v_week_start AND p_sunday
    ) AS counts
    WHERE student.is_active = true
      AND COALESCE(student.operational_status, '') NOT IN (
        'inactive', 'paused', 'retired', 'withdrawn', 'blocked', 'suspended'
      )
  ), combined AS (
    SELECT * FROM cancellation_candidates
    UNION ALL
    SELECT * FROM quota_candidates WHERE missing_count > 0
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(combined) ORDER BY student_name, candidate_type),
    '[]'::jsonb
  )
  INTO v_candidates
  FROM combined;

  RETURN jsonb_build_object(
    'is_sunday', true,
    'week_start', v_week_start,
    'week_end', p_sunday,
    'pending_count', v_pending_count,
    'candidates', v_candidates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_attendance_review(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_weekly_no_show(
  p_student_id uuid,
  p_sunday date,
  p_request_id uuid
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
  v_weekly_class_target integer := 0;
  v_attended_count integer := 0;
  v_booking_no_show_count integer := 0;
  v_weekly_no_show_count integer := 0;
  v_neutralized_cancellation_count integer := 0;
  v_raw_missing_count integer := 0;
  v_available_classes integer := 0;
  v_remaining_missing_count integer := 0;
  v_membership_id uuid;
  v_reserved_count integer := 0;
  v_occurrence_index smallint;
  v_existing_id uuid;
  v_existing_student_id uuid;
  v_existing_week_start date;
  v_existing_occurrence_index smallint;
  v_existing_membership_id uuid;
  v_existing_remaining_missing_count integer;
  v_existing_balance_after integer;
  v_weekly_attendance_id uuid;
  v_note text;
  v_balance_after integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar inasistencias semanales';
  END IF;
  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RAISE EXCEPTION 'La revisión semanal solo puede registrarse para un domingo';
  END IF;
  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede registrar una inasistencia para una semana futura';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud requiere una clave de idempotencia';
  END IF;

  v_week_start := p_sunday - 6;

  SELECT
    attendance.id,
    attendance.student_id,
    attendance.week_start,
    attendance.occurrence_index,
    attendance.student_membership_id,
    attendance.result_remaining_missing_count,
    attendance.membership_classes_remaining_after
  INTO
    v_existing_id,
    v_existing_student_id,
    v_existing_week_start,
    v_existing_occurrence_index,
    v_existing_membership_id,
    v_existing_remaining_missing_count,
    v_existing_balance_after
  FROM public.student_weekly_attendance AS attendance
  WHERE attendance.idempotency_key = p_request_id
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_student_id <> p_student_id OR v_existing_week_start <> v_week_start THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra solicitud';
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id,
      'occurrence_index', v_existing_occurrence_index,
      'remaining_missing_count', COALESCE(v_existing_remaining_missing_count, 0),
      'classes_remaining', v_existing_balance_after
    );
  END IF;

  SELECT student.id INTO v_student_id
  FROM public.students AS student
  WHERE student.id = p_student_id
    AND student.is_active = true
    AND COALESCE(student.operational_status, '') NOT IN (
      'inactive', 'paused', 'retired', 'withdrawn', 'blocked', 'suspended'
    )
  FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado o no elegible';
  END IF;

  PERFORM membership.id
  FROM public.student_memberships AS membership
  WHERE membership.student_id = p_student_id
    AND membership.status = 'active'
    AND membership.start_date <= v_week_start
    AND (membership.end_date IS NULL OR membership.end_date >= p_sunday)
  ORDER BY membership.start_date, membership.created_at, membership.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.bookings AS pending_booking
    JOIN public.sessions AS pending_session ON pending_session.id = pending_booking.session_id
    WHERE pending_booking.status = 'reserved'
      AND pending_booking.student_id IS NOT NULL
      AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_week_start AND p_sunday
  ) THEN
    RAISE EXCEPTION 'Primero completa las asistencias pendientes de lunes a domingo';
  END IF;

  SELECT membership.weekly_class_target INTO v_weekly_class_target
  FROM public.student_memberships AS membership
  WHERE membership.student_id = p_student_id
    AND membership.status = 'active'
    AND membership.weekly_class_target > 0
    AND membership.start_date <= v_week_start
    AND (membership.end_date IS NULL OR membership.end_date >= p_sunday)
    AND NOT EXISTS (
      SELECT 1
      FROM public.membership_freezes AS membership_freeze
      WHERE membership_freeze.membership_purchase_id = membership.purchase_id
        AND membership_freeze.status <> 'cancelled'
        AND daterange(membership_freeze.start_date, membership_freeze.end_date, '[]')
          && daterange(v_week_start, p_sunday, '[]')
    )
  ORDER BY membership.start_date, membership.created_at, membership.id
  LIMIT 1;

  v_weekly_class_target := COALESCE(v_weekly_class_target, 0);
  IF v_weekly_class_target = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'remaining_missing_count', 0,
      'classes_remaining', NULL
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE booking.status = 'attended')::integer,
    COUNT(*) FILTER (WHERE booking.status = 'no_show')::integer,
    COUNT(*) FILTER (
      WHERE cancellation.cancellation_source IN ('academy', 'membership_freeze')
        OR (
          cancellation.cancellation_source = 'student'
          AND (
            cancellation.review_status = 'pending'
            OR cancellation.resolution = 'justified'
          )
        )
    )::integer
  INTO
    v_attended_count,
    v_booking_no_show_count,
    v_neutralized_cancellation_count
  FROM public.bookings AS booking
  JOIN public.sessions AS session ON session.id = booking.session_id
  LEFT JOIN public.booking_cancellations AS cancellation ON cancellation.booking_id = booking.id
  WHERE booking.student_id = p_student_id
    AND (session.start_at AT TIME ZONE 'America/Lima')::date
      BETWEEN v_week_start AND p_sunday;

  SELECT COUNT(*)::integer INTO v_weekly_no_show_count
  FROM public.student_weekly_attendance AS attendance
  WHERE attendance.student_id = p_student_id
    AND attendance.week_start = v_week_start
    AND attendance.status = 'no_show';

  SELECT attendance.id INTO v_existing_id
  FROM public.student_weekly_attendance AS attendance
  WHERE attendance.student_id = p_student_id
    AND attendance.week_start = v_week_start
    AND attendance.status = 'no_show'
  ORDER BY attendance.occurrence_index DESC
  LIMIT 1;

  v_raw_missing_count := GREATEST(
    v_weekly_class_target
      - v_attended_count
      - v_booking_no_show_count
      - v_weekly_no_show_count
      - v_neutralized_cancellation_count,
    0
  );

  IF v_raw_missing_count <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id,
      'remaining_missing_count', 0,
      'classes_remaining', NULL
    );
  END IF;

  SELECT COALESCE(SUM(GREATEST(membership.classes_remaining - reserved.reserved_count, 0)), 0)::integer
  INTO v_available_classes
  FROM public.student_memberships AS membership
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::integer AS reserved_count
    FROM public.bookings AS reserved_booking
    WHERE reserved_booking.active_membership_id = membership.id
      AND reserved_booking.status = 'reserved'
  ) AS reserved
  WHERE membership.student_id = p_student_id
    AND membership.status = 'active'
    AND membership.start_date <= v_week_start
    AND (membership.end_date IS NULL OR membership.end_date >= p_sunday)
    AND NOT EXISTS (
      SELECT 1
      FROM public.membership_freezes AS membership_freeze
      WHERE membership_freeze.membership_purchase_id = membership.purchase_id
        AND membership_freeze.status <> 'cancelled'
        AND daterange(membership_freeze.start_date, membership_freeze.end_date, '[]')
          && daterange(v_week_start, p_sunday, '[]')
    );

  SELECT membership.id, reserved.reserved_count
  INTO v_membership_id, v_reserved_count
  FROM public.student_memberships AS membership
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::integer AS reserved_count
    FROM public.bookings AS reserved_booking
    WHERE reserved_booking.active_membership_id = membership.id
      AND reserved_booking.status = 'reserved'
  ) AS reserved
  WHERE membership.student_id = p_student_id
    AND membership.status = 'active'
    AND membership.start_date <= v_week_start
    AND (membership.end_date IS NULL OR membership.end_date >= p_sunday)
    AND membership.classes_remaining > reserved.reserved_count
    AND NOT EXISTS (
      SELECT 1
      FROM public.membership_freezes AS membership_freeze
      WHERE membership_freeze.membership_purchase_id = membership.purchase_id
        AND membership_freeze.status <> 'cancelled'
        AND daterange(membership_freeze.start_date, membership_freeze.end_date, '[]')
          && daterange(v_week_start, p_sunday, '[]')
    )
  ORDER BY membership.start_date, membership.created_at, membership.id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id,
      'remaining_missing_count', 0,
      'classes_remaining', NULL
    );
  END IF;

  SELECT (COALESCE(MAX(attendance.occurrence_index), 0) + 1)::smallint
  INTO v_occurrence_index
  FROM public.student_weekly_attendance AS attendance
  WHERE attendance.student_id = p_student_id
    AND attendance.week_start = v_week_start;

  v_note := CASE
    WHEN v_weekly_class_target = 1 THEN format(
      'El alumno asistió %s de la 1 clase requerida esta semana. Esta clase se considera inasistida.',
      v_attended_count
    )
    ELSE format(
      'El alumno asistió %s de las %s clases requeridas esta semana. Esta clase se considera inasistida.',
      v_attended_count,
      v_weekly_class_target
    )
  END;

  INSERT INTO public.student_weekly_attendance (
    student_id,
    student_membership_id,
    week_start,
    week_end,
    occurrence_index,
    idempotency_key,
    status,
    classes_consumed,
    note,
    marked_by_profile_id,
    marked_at,
    created_at
  ) VALUES (
    p_student_id,
    v_membership_id,
    v_week_start,
    p_sunday,
    v_occurrence_index,
    p_request_id,
    'no_show',
    1,
    v_note,
    v_actor_id,
    now(),
    now()
  )
  RETURNING id INTO v_weekly_attendance_id;

  UPDATE ONLY public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership_id
    AND classes_remaining > v_reserved_count
  RETURNING classes_remaining INTO v_balance_after;

  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'La membresía ya no tiene crédito libre disponible';
  END IF;

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
  ) VALUES (
    p_student_id,
    v_membership_id,
    v_weekly_attendance_id,
    'weekly_no_show_consumed',
    -1,
    v_balance_after,
    v_note,
    v_actor_id,
    now()
  );

  v_remaining_missing_count := LEAST(
    GREATEST(v_raw_missing_count - 1, 0),
    GREATEST(v_available_classes - 1, 0)
  );

  UPDATE public.student_weekly_attendance
  SET
    result_remaining_missing_count = v_remaining_missing_count,
    membership_classes_remaining_after = v_balance_after
  WHERE id = v_weekly_attendance_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_marked', false,
    'weekly_attendance_id', v_weekly_attendance_id,
    'occurrence_index', v_occurrence_index,
    'remaining_missing_count', v_remaining_missing_count,
    'classes_remaining', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_weekly_no_show(uuid, date, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_weekly_attendance_review(date) IS
  'Calcula la revisión semanal completa de lunes a domingo y neutraliza cancelaciones sin deuda.';

COMMENT ON FUNCTION public.admin_mark_weekly_no_show(uuid, date, uuid) IS
  'Registra una inasistencia semanal sobre la misma ventana de lunes a domingo usada por la revisión.';
