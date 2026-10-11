-- Execute fixture + migration + this file inside BEGIN / ROLLBACK.
DO $qa$
DECLARE
  v_student uuid; v_admin uuid; v_cycle uuid; v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_current uuid := gen_random_uuid(); v_old uuid := gen_random_uuid(); v_session uuid := gen_random_uuid();
  v_today_session uuid := gen_random_uuid(); v_pending uuid := gen_random_uuid(); v_attended uuid := gen_random_uuid();
  v_unmarked uuid := gen_random_uuid(); v_recovery_booking uuid; v_failed boolean; v_result json; v_count integer; v_balance integer;
BEGIN
  SELECT student_id,admin_id,cycle_id,recovery_booking_id INTO v_student,v_admin,v_cycle,v_recovery_booking FROM attendance_policy_qa;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF has_function_privilege('anon','public.run_attendance_day_close()','EXECUTE')
    OR has_function_privilege('authenticated','public.run_attendance_day_close()','EXECUTE')
    OR has_function_privilege('anon','public.get_student_attendance_history(uuid,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'QA failed: closure/history ACL';
  END IF;

  INSERT INTO public.student_memberships(id,student_id,custom_name,classes_total,classes_used,classes_remaining,start_date,end_date,status,total_amount,attendance_policy_started_on)
  VALUES(v_current,v_student,'QA current',4,0,4,v_today-2,v_today+10,'active',0,v_today-1),
    (v_old,v_student,'QA historical',3,0,3,v_today-30,v_today-20,'expired',0,NULL);
  INSERT INTO public.sessions(id,start_at,end_at,capacity,physical_capacity,status,location_id)
  SELECT v_session,(v_today-1+TIME '10:00') AT TIME ZONE 'America/Lima',
    (v_today-1+TIME '11:00') AT TIME ZONE 'America/Lima',8,8,'scheduled',id
  FROM public.academy_locations WHERE code='tiabaya';
  INSERT INTO public.sessions(id,start_at,end_at,capacity,physical_capacity,status,location_id)
  SELECT v_today_session,(v_today+TIME '10:00') AT TIME ZONE 'America/Lima',
    (v_today+TIME '11:00') AT TIME ZONE 'America/Lima',8,8,'scheduled',id
  FROM public.academy_locations WHERE code='tiabaya';
  INSERT INTO public.bookings(id,user_id,student_id,session_id,active_membership_id,status,distance_m,bow_usage_type)
  VALUES(v_pending,v_admin,v_student,v_session,v_current,'reserved',18,'own'),
    (v_attended,v_admin,v_student,v_today_session,v_current,'reserved',18,'own');

  v_failed:=false;
  BEGIN PERFORM public.admin_mark_attendance(v_attended,false);
  EXCEPTION WHEN OTHERS THEN v_failed:=SQLERRM LIKE '%inasistencias%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: no-show accepted'; END IF;
  v_failed:=false;
  BEGIN PERFORM public.admin_mark_attendance(v_pending,true);
  EXCEPTION WHEN OTHERS THEN v_failed:=SQLERRM LIKE '%El día terminó%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: attendance after day end'; END IF;
  v_result:=public.admin_mark_attendance(v_attended,true);
  PERFORM public.admin_mark_attendance(v_attended,true);
  IF (SELECT classes_remaining FROM public.student_memberships WHERE id=v_current)<>3 THEN
    RAISE EXCEPTION 'QA failed: attendance must consume exactly once'; END IF;

  -- Already attended rows survive day close; pending rows retain credit and release resources.
  PERFORM public.close_unattended_daily_bookings();
  PERFORM public.close_unattended_daily_bookings();
  IF (SELECT status FROM public.bookings WHERE id=v_pending)<>'cancelled'
    OR (SELECT status FROM public.bookings WHERE id=v_attended)<>'attended'
    OR (SELECT classes_remaining FROM public.student_memberships WHERE id=v_current)<>3
    OR EXISTS(SELECT 1 FROM public.student_credit_ledger WHERE booking_id=v_pending AND delta<>0)
    OR EXISTS(SELECT 1 FROM public.booking_resource_claims WHERE booking_id=v_pending AND released_at IS NULL)
    OR (SELECT count(*) FROM public.booking_cancellations WHERE booking_id=v_pending)<>1 THEN
    RAISE EXCEPTION 'QA failed: daily close changed credit/history/resources'; END IF;
  -- Today's pending class must remain reserved, including the final day of its period.
  INSERT INTO public.sessions(start_at,end_at,capacity,physical_capacity,status,location_id)
  SELECT (v_today+TIME '12:00') AT TIME ZONE 'America/Lima',
    (v_today+TIME '13:00') AT TIME ZONE 'America/Lima',8,8,'scheduled',id
  FROM public.academy_locations WHERE code='tiabaya' RETURNING id INTO v_today_session;
  INSERT INTO public.bookings(id,user_id,student_id,session_id,active_membership_id,status,distance_m,bow_usage_type)
  VALUES(v_unmarked,v_admin,v_student,v_today_session,v_current,'reserved',18,'own');
  PERFORM public.close_unattended_daily_bookings();
  IF (SELECT status FROM public.bookings WHERE id=v_unmarked)<>'reserved' THEN
    RAISE EXCEPTION 'QA failed: same-day cancellation'; END IF;

  UPDATE public.student_memberships SET end_date=v_today WHERE id=v_cycle;
  IF EXISTS(SELECT 1 FROM public.membership_class_expirations WHERE student_membership_id=v_cycle) THEN
    RAISE EXCEPTION 'QA failed: last valid day expired too early'; END IF;
  UPDATE public.student_memberships SET end_date=v_today-1 WHERE id=v_cycle;
  PERFORM public.run_attendance_day_close();
  PERFORM public.run_attendance_day_close();
  IF (SELECT classes_remaining FROM public.student_memberships WHERE id=v_cycle)<>0
    OR (SELECT classes_used FROM public.student_memberships WHERE id=v_cycle)<>1
    OR (SELECT sum(classes_remaining) FROM public.membership_recovery_credits WHERE student_membership_id=v_cycle)<>0
    OR NOT EXISTS(SELECT 1 FROM public.membership_class_expirations WHERE student_membership_id=v_cycle AND normal_classes=3 AND recovery_classes=2)
    OR (SELECT count(*) FROM public.student_credit_ledger WHERE student_membership_id=v_cycle AND movement_type='membership_classes_expired')<>1 THEN
    RAISE EXCEPTION 'QA failed: expiry balance/idempotency'; END IF;
  IF (SELECT classes_remaining FROM public.student_memberships WHERE id=v_old)<>3
    OR EXISTS(SELECT 1 FROM public.membership_class_expirations WHERE student_membership_id=v_old) THEN
    RAISE EXCEPTION 'QA failed: historical cycle altered'; END IF;
  SELECT count(*) INTO v_count FROM public.get_student_attendance_history(v_student,1,100)
    WHERE status='expired_unattended' AND student_membership_id=v_cycle;
  IF v_count<>5 THEN RAISE EXCEPTION 'QA failed: history omitted expired credits'; END IF;
  v_failed:=false;
  BEGIN UPDATE public.student_memberships SET end_date=v_today+30,classes_remaining=5,status='active' WHERE id=v_cycle;
  EXCEPTION WHEN OTHERS THEN v_failed:=SQLERRM LIKE '%no recuperables%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: expired cycle recovered'; END IF;
  v_failed:=false;
  BEGIN UPDATE public.membership_recovery_credits SET classes_remaining=1 WHERE student_membership_id=v_cycle;
  EXCEPTION WHEN OTHERS THEN v_failed:=SQLERRM LIKE '%no recuperables%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: expired legacy recovery refunded'; END IF;
  v_failed:=false;
  BEGIN PERFORM public.admin_reverse_no_show('booking',v_recovery_booking,'QA expired refund',gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_failed:=SQLERRM LIKE '%no recuperables%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: legacy reversal RPC restored expired recovery'; END IF;
  v_failed:=false;
  BEGIN INSERT INTO public.membership_recovery_credits(student_id,student_membership_id,source_membership_id,classes_granted,classes_remaining,recovery_reason)
    VALUES(v_student,v_current,v_cycle,1,1,'Forbidden carryover');
  EXCEPTION WHEN OTHERS THEN v_failed:=SQLERRM LIKE '%no se trasladan%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: recovery granted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  v_failed:=false;
  BEGIN PERFORM public.get_student_attendance_history(v_student,1,100);
  EXCEPTION WHEN OTHERS THEN v_failed:=true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'QA failed: unauthorized history'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
END;
$qa$;
SELECT 'attendance-only: all transactional assertions passed' AS qa_result;

