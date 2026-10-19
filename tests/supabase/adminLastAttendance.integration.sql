-- Run only on a disposable test database after applying the migration. Always rolls back.
BEGIN;
DO $$
DECLARE actor uuid; nonadmin uuid; site uuid; student uuid; empty_student uuid; session uuid; membership uuid;
  result jsonb; attendance timestamptz;
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='admin' AND is_active LIMIT 1;
  SELECT id INTO STRICT site FROM public.academy_locations LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.get_admin_last_attendance_summary();
    RAISE EXCEPTION 'Anonymous attendance summary allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  FOR nonadmin IN SELECT id FROM public.profiles WHERE role IN ('student','guardian') LOOP
    PERFORM set_config('request.jwt.claim.sub', nonadmin::text, true);
    BEGIN
      PERFORM public.get_admin_last_attendance_summary();
      RAISE EXCEPTION 'Non-admin attendance summary allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  INSERT INTO public.students(full_name,home_location_id,has_own_bow)
    VALUES('QA attendance aggregate',site,true) RETURNING id INTO student;
  INSERT INTO public.students(full_name,home_location_id,has_own_bow)
    VALUES('QA no attendance',site,true) RETURNING id INTO empty_student;
  INSERT INTO public.student_memberships(student_id,custom_name,classes_total,classes_remaining,start_date,end_date,status)
    VALUES(student,'QA attendance history',1001,1001,'2040-01-01','2048-01-01','active') RETURNING id INTO membership;

  -- Over 1000 rows, each on its own session, with a deliberately late marking date.
  FOR i IN 0..1000 LOOP
    INSERT INTO public.sessions(start_at,end_at,location_id,capacity,physical_capacity,regular_capacity,capacity_policy,notes)
    VALUES('2040-01-01T15:00:00Z'::timestamptz + i * interval '1 day',
      '2040-01-01T16:00:00Z'::timestamptz + i * interval '1 day',site,40,40,40,'fixed_operational','QA attendance rollback')
      RETURNING id INTO session;
    INSERT INTO public.bookings(user_id,student_id,session_id,active_membership_id,status,bow_usage_type,attendance_marked_at)
      VALUES(actor,student,session,membership,'attended','own','2045-01-01T15:00:00Z');
  END LOOP;
  -- Later cancelled booking must not be counted.
  INSERT INTO public.sessions(start_at,end_at,location_id,capacity,physical_capacity,regular_capacity,capacity_policy)
    VALUES('2046-01-01T15:00:00Z','2046-01-01T16:00:00Z',site,40,40,40,'fixed_operational') RETURNING id INTO session;
  INSERT INTO public.bookings(user_id,student_id,session_id,status,bow_usage_type)
    VALUES(actor,student,session,'cancelled','own');
  result := public.get_admin_last_attendance_summary();
  SELECT (row->>'last_attendance_at')::timestamptz INTO attendance
    FROM jsonb_array_elements(result) row WHERE row->>'student_id'=student::text;
  IF attendance IS DISTINCT FROM '2040-01-01T15:00:00Z'::timestamptz + interval '1000 days'
    THEN RAISE EXCEPTION 'Last attendance truncated or marking date used'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) row WHERE row->>'student_id'=empty_student::text)
    THEN RAISE EXCEPTION 'Student without attendance appears in summary'; END IF;
  IF has_function_privilege('anon','public.get_admin_last_attendance_summary()','EXECUTE')
    THEN RAISE EXCEPTION 'Anonymous execute grant'; END IF;
END $$;
ROLLBACK;
