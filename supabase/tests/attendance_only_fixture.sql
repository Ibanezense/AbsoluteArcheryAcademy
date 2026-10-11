-- Run this fixture BEFORE the migration inside one transaction ending in ROLLBACK.
CREATE TEMP TABLE attendance_policy_qa (student_id uuid, admin_id uuid, cycle_id uuid, recovery_booking_id uuid);
DO $$
DECLARE v_student uuid := gen_random_uuid(); v_admin uuid; v_cycle uuid := gen_random_uuid();
  v_recovery uuid; v_session uuid; v_booking uuid:=gen_random_uuid();
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role='admin' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'QA requires an admin'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  INSERT INTO public.students(id,full_name,current_distance_m,has_own_bow,is_active,created_by)
  VALUES(v_student,'QA attendance-only rollback',18,true,true,v_admin);
  INSERT INTO public.student_memberships(id,student_id,custom_name,classes_total,classes_used,classes_remaining,start_date,end_date,status,total_amount)
  VALUES(v_cycle,v_student,'QA cycle with legacy recovery',4,1,3,
    (now() AT TIME ZONE 'America/Lima')::date-10,(now() AT TIME ZONE 'America/Lima')::date+10,'active',0);
  INSERT INTO public.membership_recovery_credits(student_id,student_membership_id,classes_granted,classes_remaining,recovery_reason,granted_by)
  VALUES(v_student,v_cycle,3,2,'Pre-policy commitment',v_admin) RETURNING id INTO v_recovery;
  INSERT INTO public.sessions(start_at,end_at,capacity,physical_capacity,status,location_id)
  SELECT ((now() AT TIME ZONE 'America/Lima')::date-2+TIME '14:00') AT TIME ZONE 'America/Lima',
    ((now() AT TIME ZONE 'America/Lima')::date-2+TIME '15:00') AT TIME ZONE 'America/Lima',8,8,'scheduled',id
  FROM public.academy_locations WHERE code='tiabaya' RETURNING id INTO v_session;
  INSERT INTO public.bookings(id,user_id,student_id,session_id,active_membership_id,status,distance_m,bow_usage_type,credit_kind,recovery_credit_id)
  VALUES(v_booking,v_admin,v_student,v_session,v_cycle,'no_show',18,'own','recovery',v_recovery);
  INSERT INTO public.student_credit_ledger(student_id,student_membership_id,booking_id,movement_type,delta,balance_after,reason,performed_by_profile_id)
  VALUES(v_student,v_cycle,v_booking,'recovery_consumed',-1,2,'QA historical recovery consumption',v_admin);
  INSERT INTO attendance_policy_qa VALUES(v_student,v_admin,v_cycle,v_booking);
END;
$$;
