-- Execute with BEGIN/ROLLBACK, never leave QA records behind.
DO $$
DECLARE
  actor uuid; other_actor uuid; site uuid; student uuid; membership uuid;
  slot1 uuid; slot2 uuid; slot3 uuid; full_slot uuid; booking uuid; version timestamptz;
  moved public.bookings; rejected boolean; today date := (now() AT TIME ZONE 'America/Lima')::date; target_day date := today+20;
BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='admin' AND is_active LIMIT 1;
  SELECT id INTO other_actor FROM public.profiles WHERE role<>'admin' LIMIT 1;
  SELECT id INTO site FROM public.academy_locations WHERE code='tiabaya' AND is_active;
  IF actor IS NULL OR site IS NULL THEN RAISE EXCEPTION 'Missing QA admin or site'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  INSERT INTO public.students(full_name,current_distance_m,has_own_bow,is_active,operational_status)
    VALUES ('QA reschedule rollback',18,true,true,'active') RETURNING id INTO student;
  INSERT INTO public.student_memberships(student_id,custom_name,classes_total,classes_remaining,start_date,end_date,status,weekly_class_target)
    VALUES (student,'QA reschedule',8,8,today,today+60,'active',2) RETURNING id INTO membership;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,notes)
    VALUES ((target_day+time '09:00') AT TIME ZONE 'America/Lima',(target_day+time '10:00') AT TIME ZONE 'America/Lima',site,'scheduled',2,2,'QA reschedule rollback') RETURNING id INTO slot1;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,notes)
    VALUES ((target_day+time '11:00') AT TIME ZONE 'America/Lima',(target_day+time '12:00') AT TIME ZONE 'America/Lima',site,'scheduled',2,2,'QA reschedule rollback') RETURNING id INTO slot2;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,notes)
    VALUES ((target_day+time '11:30') AT TIME ZONE 'America/Lima',(target_day+time '12:30') AT TIME ZONE 'America/Lima',site,'scheduled',2,2,'QA reschedule rollback') RETURNING id INTO slot3;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,notes)
    VALUES ((target_day+time '13:00') AT TIME ZONE 'America/Lima',(target_day+time '14:00') AT TIME ZONE 'America/Lima',site,'scheduled',0,0,'QA reschedule rollback') RETURNING id INTO full_slot;
  INSERT INTO public.bookings(user_id,session_id,student_id,active_membership_id,status,distance_m,bow_usage_type)
    VALUES (actor,slot1,student,membership,'reserved',18,'own') RETURNING id,updated_at INTO booking,version;
  IF NOT EXISTS (SELECT 1 FROM public.admin_get_booking_move_options(booking,target_day,site) o WHERE o.session_id=slot2 AND o.available) THEN RAISE EXCEPTION 'Available option missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_get_booking_move_options(booking,target_day,site) o WHERE o.session_id=full_slot AND o.available) THEN RAISE EXCEPTION 'Full option offered'; END IF;
  moved:=public.admin_reschedule_student_booking(booking,slot2,version);
  IF moved.id<>booking OR moved.session_id<>slot2 OR moved.active_membership_id<>membership OR NOT moved.manually_rescheduled THEN RAISE EXCEPTION 'Move did not preserve identity'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_memberships WHERE id=membership AND classes_remaining=8 AND classes_used=0) THEN RAISE EXCEPTION 'Move changed balance'; END IF;
  IF EXISTS (SELECT 1 FROM public.booking_resource_claims WHERE booking_id=booking AND session_id=slot1 AND released_at IS NULL) OR NOT EXISTS (SELECT 1 FROM public.booking_resource_claims WHERE booking_id=booking AND session_id=slot2 AND released_at IS NULL) THEN RAISE EXCEPTION 'Resource transfer failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_action_audit WHERE booking_id=booking AND action_type='booking_rescheduled') THEN RAISE EXCEPTION 'Audit missing'; END IF;
  rejected:=false;
  BEGIN PERFORM public.admin_reschedule_student_booking(booking,slot1,version); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%cambió%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale move accepted'; END IF;
  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  rejected:=false;
  BEGIN PERFORM public.admin_reschedule_student_booking(booking,full_slot,version); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%espacios%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Full move accepted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_resource_claims WHERE booking_id=booking AND session_id=slot2 AND released_at IS NULL) THEN RAISE EXCEPTION 'Failed move lost original claim'; END IF;
  UPDATE public.student_memberships SET end_date=target_day-1 WHERE id=membership;
  rejected:=false;
  BEGIN PERFORM public.admin_reschedule_student_booking(booking,slot1,version); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%vigencia%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expired membership move accepted'; END IF;
  UPDATE public.student_memberships SET end_date=today+60 WHERE id=membership;
  INSERT INTO public.membership_freezes(student_id,membership_purchase_id,start_date,end_date,duration_days,reason)
    SELECT student,purchase_id,target_day,target_day,1,'QA' FROM public.student_memberships WHERE id=membership;
  rejected:=false;
  BEGIN PERFORM public.admin_reschedule_student_booking(booking,slot1,version); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%congelada%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Frozen membership move accepted'; END IF;
  DELETE FROM public.membership_freezes WHERE student_id=student;
  -- A second reservation makes moving the first into the overlapping turn invalid.
  INSERT INTO public.bookings(user_id,session_id,student_id,active_membership_id,status,distance_m,bow_usage_type)
    VALUES (actor,slot1,student,membership,'reserved',18,'own');
  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  rejected:=false;
  BEGIN PERFORM public.admin_reschedule_student_booking(booking,slot1,version); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%superpuesto%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Overlapping move accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',coalesce(other_actor::text,''),true);
  rejected:=false;
  BEGIN PERFORM public.admin_reschedule_student_booking(booking,slot3,version); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%autorizado%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Nonadmin move accepted'; END IF;
  rejected:=false;
  BEGIN PERFORM public.admin_get_booking_move_options(booking,target_day,site); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%autorizado%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Nonadmin picker accepted'; END IF;
END;
$$;
SELECT 'reschedule: identity, balance, claims, audit, stale, full, expiry, freeze, overlap and authorization passed' AS verification;

DO $$
DECLARE
  actor uuid; site uuid; student uuid; membership uuid; bow uuid;
  original uuid; destination uuid; booking uuid; version timestamptz; moved public.bookings;
  today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='admin' AND is_active LIMIT 1;
  SELECT id INTO site FROM public.academy_locations WHERE code='tiabaya' AND is_active;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  INSERT INTO public.students(full_name,current_distance_m,bow_poundage)
    VALUES ('QA shared reschedule rollback',18,77) RETURNING id INTO student;
  INSERT INTO public.student_memberships(student_id,custom_name,classes_total,classes_remaining,start_date,end_date,status)
    VALUES (student,'QA shared bow',8,8,today,today+60,'active') RETURNING id INTO membership;
  INSERT INTO public.academy_bows(asset_code,draw_weight_lbs,pool_type)
    VALUES ('QA-MOVE-'||gen_random_uuid(),77,'shared') RETURNING id INTO bow;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,notes)
    VALUES ((today+21+time '09:00') AT TIME ZONE 'America/Lima',(today+21+time '10:00') AT TIME ZONE 'America/Lima',site,'scheduled',1,1,'QA shared rollback') RETURNING id INTO original;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,notes)
    VALUES ((today+21+time '09:30') AT TIME ZONE 'America/Lima',(today+21+time '10:30') AT TIME ZONE 'America/Lima',site,'scheduled',1,1,'QA shared rollback') RETURNING id INTO destination;
  INSERT INTO public.session_equipment_allocations(session_id,draw_weight_lbs,quantity) VALUES (original,77,1),(destination,77,1);
  INSERT INTO public.bookings(user_id,session_id,student_id,active_membership_id,status,distance_m,bow_usage_type,bow_poundage,credit_kind)
    VALUES (actor,original,student,membership,'reserved',18,'shared_inventory',77,'normal') RETURNING id,updated_at INTO booking,version;
  IF NOT EXISTS (SELECT 1 FROM public.admin_get_booking_move_options(booking,today+21,site) o WHERE o.session_id=destination AND o.available) THEN RAISE EXCEPTION 'Own shared bow blocked the move preview'; END IF;
  moved:=public.admin_reschedule_student_booking(booking,destination,version);
  IF moved.credit_kind<>'normal' OR moved.active_membership_id<>membership THEN RAISE EXCEPTION 'Credit identity changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_memberships WHERE id=membership AND classes_remaining=8) THEN RAISE EXCEPTION 'Shared move changed balance'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_resource_claims WHERE booking_id=booking AND session_id=destination AND resource_type='shared_bow' AND academy_bow_id=bow AND released_at IS NULL) THEN RAISE EXCEPTION 'Shared bow transfer failed'; END IF;
END;
$$;
SELECT 'shared bow can move to overlapping turn; membership identity and balance preserved' AS verification;
