-- Run after the migration inside the SAME transaction; always ROLLBACK.
DO $$
DECLARE
  actor uuid; other_actor uuid; location uuid; slot1 uuid; slot2 uuid;
  booking uuid; client uuid; result jsonb; version timestamptz; request uuid := gen_random_uuid();
  response jsonb; rejected boolean; fill_index integer;
BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='admin' LIMIT 1;
  SELECT id INTO other_actor FROM public.profiles WHERE role<>'admin' LIMIT 1;
  SELECT id INTO location FROM public.academy_locations WHERE code='umacollo' AND is_active LIMIT 1;
  IF actor IS NULL OR location IS NULL THEN RAISE EXCEPTION 'QA requires an admin and active Umacollo location'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  rejected := false;
  BEGIN PERFORM public.admin_get_intro_calendar(current_date, current_date, NULL);
  EXCEPTION WHEN OTHERS THEN rejected := SQLERRM LIKE '%administradores%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Anonymous access was allowed'; END IF;
  IF other_actor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', other_actor::text, true);
    rejected := false;
    BEGIN PERFORM public.admin_get_intro_calendar(current_date, current_date, NULL);
    EXCEPTION WHEN OTHERS THEN rejected := SQLERRM LIKE '%administradores%'; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Non-admin access was allowed'; END IF;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);

  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,regular_capacity,capacity_policy,notes)
  VALUES (now()+interval '10 years',now()+interval '10 years 1 hour',location,'scheduled',1,1,1,'fixed_operational','QA intro calendar rollback') RETURNING id INTO slot1;
  INSERT INTO public.sessions(start_at,end_at,location_id,status,capacity,physical_capacity,regular_capacity,capacity_policy,notes)
  VALUES (now()+interval '10 years 2 hours',now()+interval '10 years 3 hours',location,'scheduled',1,1,1,'fixed_operational','QA intro calendar rollback') RETURNING id INTO slot2;

  -- Umacollo has an operational capacity of four, independent of session capacity.
  FOR fill_index IN 1..3 LOOP
    PERFORM public.admin_register_intro_appointment('QA filler',25,NULL,slot1,0,'not_applicable','free','not_applicable',NULL,false,gen_random_uuid());
    PERFORM public.admin_register_intro_appointment('QA filler',25,NULL,slot2,0,'not_applicable','free','not_applicable',NULL,false,gen_random_uuid());
  END LOOP;

  result := public.admin_register_intro_appointment('QA Calendar', 25, NULL, slot1, 45, 'not_applicable', 'paid', 'pending', NULL, true, request);
  booking := (result->>'booking_id')::uuid; client := (result->>'intro_client_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.intro_payments WHERE intro_client_id=client AND payment_status='pending' AND pay_on_site AND paid_at IS NULL) THEN RAISE EXCEPTION 'On-site pending payment not persisted correctly'; END IF;
  -- Legacy rows may have a paid_at value while still pending. They are not income.
  UPDATE public.intro_payments SET paid_at=now() WHERE intro_client_id=client;
  IF EXISTS (SELECT 1 FROM public.get_finances_report(current_date-1,current_date+2) WHERE payment_id=(result->>'payment_id')::uuid) THEN RAISE EXCEPTION 'A pending payment was counted as income'; END IF;
  UPDATE public.intro_payments SET paid_at=NULL WHERE intro_client_id=client;
  response := public.admin_register_intro_appointment('QA Calendar', 25, NULL, slot1, 45, 'not_applicable', 'paid', 'pending', NULL, true, request);
  IF response->>'booking_id'<>booking::text THEN RAISE EXCEPTION 'Retry duplicated the booking'; END IF;
  IF public.intro_calendar_spots(slot1)<>0 THEN RAISE EXCEPTION 'Pending booking did not reserve the final spot'; END IF;

  rejected := false;
  BEGIN PERFORM public.admin_register_intro_appointment('QA excess',25,NULL,slot1,45,'not_applicable','paid','pending',NULL,false,gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN rejected := SQLERRM LIKE '%cupo%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Overbooking allowed'; END IF;

  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  response := public.admin_change_intro_appointment(booking,version,'edit',slot1,NULL,
    jsonb_build_object('fullName','QA Edited','age',26,'phone','999000111','introClassType','paid','paymentStatus','pending','amountPaid',45,'paymentMethod','not_applicable','payOnSite',true));
  IF NOT EXISTS (SELECT 1 FROM public.intro_clients WHERE id=client AND full_name='QA Edited') THEN RAISE EXCEPTION 'Edit on a full session failed'; END IF;
  rejected := false;
  BEGIN PERFORM public.admin_change_intro_appointment(booking,version,'move',slot2,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN rejected := SQLERRM LIKE '%cambió%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Stale version was allowed'; END IF;

  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  PERFORM public.admin_change_intro_appointment(booking,version,'move',slot2,NULL,NULL);
  IF public.intro_calendar_spots(slot1)<>1 OR public.intro_calendar_spots(slot2)<>0 THEN RAISE EXCEPTION 'Move did not release/reserve capacity'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intro_payments WHERE intro_client_id=client AND payment_status='pending' AND pay_on_site) THEN RAISE EXCEPTION 'Move changed payment'; END IF;

  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  PERFORM public.admin_change_intro_appointment(booking,version,'state',NULL,'paid','{"paymentMethod":"efectivo"}');
  IF NOT EXISTS (SELECT 1 FROM public.intro_payments WHERE intro_client_id=client AND payment_status='paid' AND NOT pay_on_site AND paid_at IS NOT NULL AND payment_method='efectivo') THEN RAISE EXCEPTION 'Paid transition failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_finances_report((now() AT TIME ZONE 'America/Lima')::date-1,(now() AT TIME ZONE 'America/Lima')::date+2) WHERE payment_id=(result->>'payment_id')::uuid) THEN RAISE EXCEPTION 'Confirmed payment missing from finances'; END IF;

  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  PERFORM public.admin_change_intro_appointment(booking,version,'state',NULL,'cancelled',NULL);
  IF public.intro_calendar_spots(slot2)<>1 THEN RAISE EXCEPTION 'Cancellation did not free capacity'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intro_payments WHERE intro_client_id=client AND payment_status='paid' AND payment_method='efectivo') THEN RAISE EXCEPTION 'Cancellation erased payment'; END IF;
  response := public.admin_get_intro_calendar(((now()+interval '10 years') AT TIME ZONE 'America/Lima')::date,((now()+interval '10 years 3 hours') AT TIME ZONE 'America/Lima')::date,location);
  IF NOT jsonb_path_exists(response, '$[*].clients[*] ? (@.booking_status == "cancelled")') THEN RAISE EXCEPTION 'Cancelled appointment not visible'; END IF;

  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  PERFORM public.admin_change_intro_appointment(booking,version,'state',NULL,'paid','{"paymentMethod":"efectivo"}');
  UPDATE public.sessions SET start_at=now()-interval '2 hours',end_at=now()-interval '1 hour' WHERE id=slot2;
  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  PERFORM public.admin_change_intro_appointment(booking,version,'state',NULL,'no_show',NULL);
  SELECT updated_at INTO version FROM public.bookings WHERE id=booking;
  PERFORM public.admin_change_intro_appointment(booking,version,'state',NULL,'attended',NULL);
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id=booking AND status='attended' AND student_id IS NULL AND active_membership_id IS NULL) THEN RAISE EXCEPTION 'Trial attendance correction failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='reject_new_booking_no_show' AND pg_get_triggerdef(oid) LIKE '%intro_client_id IS NULL%') THEN RAISE EXCEPTION 'Regular student No show restriction changed'; END IF;
  IF (SELECT count(*) FROM public.intro_appointment_events WHERE booking_id=booking)<>8 THEN RAISE EXCEPTION 'Audit history incomplete'; END IF;
END;
$$;
SELECT 'intro calendar transactional assertions passed; all QA data rolled back' AS verification;
