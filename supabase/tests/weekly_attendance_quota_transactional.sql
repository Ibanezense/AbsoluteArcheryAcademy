BEGIN;

DO $transactional_test$
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_student_id uuid := gen_random_uuid();
  v_plan_id uuid := gen_random_uuid();
  v_first_membership_id uuid := gen_random_uuid();
  v_second_membership_id uuid := gen_random_uuid();
  v_future_session_id uuid := gen_random_uuid();
  v_sunday date := current_date - EXTRACT(DOW FROM current_date)::integer;
  request_id_retry uuid := gen_random_uuid();
  request_id_new_click uuid := gen_random_uuid();
  v_first_result jsonb;
  v_retry_result jsonb;
  v_new_click_result jsonb;
  v_weekly_count integer;
  v_ledger_count integer;
  v_first_balance integer;
  v_second_balance integer;
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_admin_id,
    'authenticated',
    'authenticated',
    format('weekly-quota-%s@example.invalid', v_admin_id),
    '',
    now(),
    '{}'::jsonb,
    jsonb_build_object('full_name', 'QA Weekly Admin'),
    now(),
    now()
  );

  INSERT INTO public.profiles (id, full_name, role, email, is_active)
  VALUES (
    v_admin_id,
    'QA Weekly Admin',
    'admin',
    format('weekly-quota-%s@example.invalid', v_admin_id),
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin', is_active = true;

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.students (
    id,
    full_name,
    current_distance_m,
    has_own_bow,
    is_active,
    created_by
  )
  VALUES (
    v_student_id,
    'QA Weekly Student',
    18,
    true,
    true,
    v_admin_id
  );

  INSERT INTO public.membership_plans (
    id,
    name,
    classes_included,
    duration_days,
    base_price,
    weekly_class_target
  )
  VALUES (
    v_plan_id,
    'QA 3 clases semanales',
    4,
    30,
    0,
    3
  );

  INSERT INTO public.student_memberships (
    id,
    student_id,
    membership_plan_id,
    custom_name,
    classes_total,
    classes_used,
    classes_remaining,
    start_date,
    end_date,
    status,
    total_amount,
    membership_origin,
    created_at,
    updated_at
  )
  VALUES
    (
      v_first_membership_id,
      v_student_id,
      v_plan_id,
      'QA FIFO First',
      2,
      0,
      2,
      v_sunday - 12,
      v_sunday + 30,
      'active',
      0,
      'paid',
      (v_sunday - 12)::timestamp AT TIME ZONE 'America/Lima',
      now()
    ),
    (
      v_second_membership_id,
      v_student_id,
      v_plan_id,
      'QA FIFO Second',
      2,
      0,
      2,
      v_sunday - 11,
      v_sunday + 30,
      'active',
      0,
      'paid',
      (v_sunday - 11)::timestamp AT TIME ZONE 'America/Lima',
      now()
    );

  INSERT INTO public.sessions (
    id,
    start_at,
    end_at,
    capacity,
    status
  )
  VALUES (
    v_future_session_id,
    ((v_sunday + 7)::timestamp + TIME '10:00') AT TIME ZONE 'America/Lima',
    ((v_sunday + 7)::timestamp + TIME '11:00') AT TIME ZONE 'America/Lima',
    8,
    'scheduled'
  );

  INSERT INTO public.bookings (
    user_id,
    session_id,
    status,
    student_id,
    booked_by_profile_id,
    active_membership_id
  )
  VALUES (
    v_admin_id,
    v_future_session_id,
    'reserved',
    v_student_id,
    v_admin_id,
    v_first_membership_id
  );

  v_first_result := public.admin_mark_weekly_no_show(
    v_student_id,
    v_sunday,
    request_id_retry
  );

  IF COALESCE((v_first_result ->> 'already_marked')::boolean, true) THEN
    RAISE EXCEPTION 'First request did not create an absence: %', v_first_result;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_weekly_count
  FROM public.student_weekly_attendance
  WHERE student_id = v_student_id;

  SELECT COUNT(*)::integer
  INTO v_ledger_count
  FROM public.student_credit_ledger
  WHERE student_id = v_student_id
    AND movement_type = 'weekly_no_show_consumed';

  SELECT classes_remaining
  INTO v_first_balance
  FROM public.student_memberships
  WHERE id = v_first_membership_id;

  SELECT classes_remaining
  INTO v_second_balance
  FROM public.student_memberships
  WHERE id = v_second_membership_id;

  IF v_weekly_count <> 1
    OR v_ledger_count <> 1
    OR v_first_balance <> 1
    OR v_second_balance <> 2
  THEN
    RAISE EXCEPTION 'Initial FIFO or reserved-credit assertion failed';
  END IF;

  v_retry_result := public.admin_mark_weekly_no_show(
    v_student_id,
    v_sunday,
    request_id_retry
  );

  SELECT COUNT(*)::integer
  INTO v_weekly_count
  FROM public.student_weekly_attendance
  WHERE student_id = v_student_id;

  SELECT COUNT(*)::integer
  INTO v_ledger_count
  FROM public.student_credit_ledger
  WHERE student_id = v_student_id
    AND movement_type = 'weekly_no_show_consumed';

  IF NOT COALESCE((v_retry_result ->> 'already_marked')::boolean, false)
    OR v_retry_result ->> 'weekly_attendance_id'
      <> v_first_result ->> 'weekly_attendance_id'
    OR v_retry_result ->> 'remaining_missing_count'
      <> v_first_result ->> 'remaining_missing_count'
    OR v_retry_result ->> 'classes_remaining'
      <> v_first_result ->> 'classes_remaining'
    OR v_weekly_count <> 1
    OR v_ledger_count <> 1
  THEN
    RAISE EXCEPTION 'Retry with the same request id was not idempotent: %', v_retry_result;
  END IF;

  v_new_click_result := public.admin_mark_weekly_no_show(
    v_student_id,
    v_sunday,
    request_id_new_click
  );

  SELECT COUNT(*)::integer
  INTO v_weekly_count
  FROM public.student_weekly_attendance
  WHERE student_id = v_student_id
    AND occurrence_index IN (1, 2);

  SELECT COUNT(*)::integer
  INTO v_ledger_count
  FROM public.student_credit_ledger
  WHERE student_id = v_student_id
    AND movement_type = 'weekly_no_show_consumed';

  SELECT classes_remaining
  INTO v_first_balance
  FROM public.student_memberships
  WHERE id = v_first_membership_id;

  SELECT classes_remaining
  INTO v_second_balance
  FROM public.student_memberships
  WHERE id = v_second_membership_id;

  IF COALESCE((v_new_click_result ->> 'already_marked')::boolean, true)
    OR v_weekly_count <> 2
    OR v_ledger_count <> 2
    OR v_first_balance <> 1
    OR v_second_balance <> 1
  THEN
    RAISE EXCEPTION 'New click, FIFO rollover or reservation protection failed: %', v_new_click_result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_weekly_attendance
    WHERE student_id = v_student_id
      AND (
        (
          occurrence_index = 1
          AND (
            student_membership_id <> v_first_membership_id
            OR idempotency_key <> request_id_retry
          )
        )
        OR (
          occurrence_index = 2
          AND (
            student_membership_id <> v_second_membership_id
            OR idempotency_key <> request_id_new_click
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Weekly rows were not linked to the expected FIFO memberships';
  END IF;
END;
$transactional_test$;

ROLLBACK;
