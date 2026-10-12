-- Isolated fixtures only. Execute inside BEGIN / ROLLBACK after the migrations.
DO $$
DECLARE
  actor uuid; location uuid; template uuid; holding uuid; destination uuid;
  client uuid; booking uuid; first_booking uuid; bow_count integer; n integer;
BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  SELECT id INTO location FROM public.academy_locations WHERE code='tiabaya' AND is_active;
  SELECT id INTO template FROM public.weekly_session_templates WHERE location_id=location AND is_active AND allows_intro LIMIT 1;
  SELECT count(*) INTO bow_count FROM public.academy_bows WHERE pool_type='shared' AND operational_status='active' AND draw_weight_lbs IN (18,20);
  IF template IS NULL OR bow_count=0 THEN RAISE EXCEPTION 'QA requires a trial template and active shared bows'; END IF;
  INSERT INTO public.sessions(location_id,weekly_template_id,start_at,end_at,physical_capacity,capacity,status,notes)
  VALUES(location,template,now()+interval '20 years',now()+interval '20 years 1 hour',100,100,'scheduled','QA resource overlap rollback') RETURNING id INTO holding;
  INSERT INTO public.sessions(location_id,weekly_template_id,start_at,end_at,physical_capacity,capacity,status,notes)
  VALUES(location,template,now()+interval '20 years 30 minutes',now()+interval '20 years 90 minutes',100,100,'scheduled','QA resource overlap rollback') RETURNING id INTO destination;
  INSERT INTO public.session_equipment_allocations(session_id,draw_weight_lbs,quantity)
  SELECT holding, weight, (SELECT count(*) FROM public.academy_bows WHERE pool_type='shared' AND operational_status='active' AND draw_weight_lbs=weight)
  FROM (VALUES (18),(20)) weights(weight)
  ON CONFLICT(session_id,draw_weight_lbs) DO UPDATE SET quantity=EXCLUDED.quantity;
  INSERT INTO public.session_equipment_allocations(session_id,draw_weight_lbs,quantity)
  SELECT destination, weight, 1 FROM (VALUES (18),(20)) weights(weight)
  ON CONFLICT(session_id,draw_weight_lbs) DO UPDATE SET quantity=EXCLUDED.quantity;
  FOR n IN 1..bow_count LOOP
    INSERT INTO public.intro_clients(full_name,age) VALUES('QA Resource',25) RETURNING id INTO client;
    INSERT INTO public.bookings(intro_client_id,session_id,status,distance_m,bow_usage_type)
    VALUES(client,holding,'reserved',10,'shared_inventory') RETURNING id INTO booking;
    IF n=1 THEN first_booking:=booking; END IF;
  END LOOP;
  IF public.intro_calendar_spots(destination)<>0 THEN RAISE EXCEPTION 'An overlapping session showed free bows while every bow was claimed'; END IF;
  IF public.intro_calendar_spots(destination,first_booking)<>1 THEN RAISE EXCEPTION 'Rescheduling did not exclude its own resource claim'; END IF;
  PERFORM public.admin_change_intro_appointment(first_booking,(SELECT updated_at FROM public.bookings WHERE id=first_booking),'state',NULL,'cancelled',NULL);
  IF public.intro_calendar_spots(destination)<>1 THEN RAISE EXCEPTION 'Released bow did not restore availability in overlapping session'; END IF;
END;
$$;
SELECT 'shared-resource overlap and booking exclusion assertions passed; QA data rolled back' AS verification;
