-- Disposable database only. Load adminTrialConversion.bootstrap.sql first.
ALTER TABLE public.sessions ADD COLUMN status text NOT NULL DEFAULT 'scheduled';
CREATE TABLE public.admin_roster_by_distance(session_id uuid,targets integer,reserved_count integer);
BEGIN;
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO profiles(id,role) VALUES('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','student');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE monday uuid; sunday uuid; before_week uuid; next_week uuid; cancelled uuid; j jsonb;
BEGIN
  INSERT INTO sessions(start_at) VALUES('2026-10-19 05:00:00Z') RETURNING id INTO monday;
  INSERT INTO sessions(start_at) VALUES('2026-10-26 04:59:59Z') RETURNING id INTO sunday;
  INSERT INTO sessions(start_at) VALUES('2026-10-19 04:59:59Z') RETURNING id INTO before_week;
  INSERT INTO sessions(start_at) VALUES('2026-10-26 05:00:00Z') RETURNING id INTO next_week;
  INSERT INTO sessions(start_at,status) VALUES('2026-10-22 15:00:00Z','cancelled') RETURNING id INTO cancelled;
  INSERT INTO bookings(session_id,status) VALUES(monday,'reserved'),(monday,'attended'),(monday,'no_show'),(monday,'cancelled'),(sunday,'reserved'),(before_week,'reserved'),(next_week,'reserved'),(cancelled,'reserved');
  INSERT INTO intro_clients(id,full_name) VALUES('10000000-0000-0000-0000-000000000001','Weekly QA');
  INSERT INTO bookings(session_id,status,intro_client_id) VALUES(sunday,'reserved','10000000-0000-0000-0000-000000000001');
  INSERT INTO admin_roster_by_distance VALUES(monday,1,1),(sunday,2,2),(before_week,9,0),(next_week,9,0),(cancelled,9,0);
  j := admin_get_weekly_dashboard_summary('2026-10-19 05:00:00Z');
  IF j->>'startDate'<>'2026-10-19' OR j->>'endDate'<>'2026-10-25' OR (j->>'reservations')::int<>5 OR (j->>'scheduledSessions')::int<>2 OR (j->>'pendingConfirmations')::int<>1 OR (j->>'attendancePending')::int<>3 OR (j->>'availableSlots')::int<>6 THEN RAISE EXCEPTION 'Week aggregate wrong: %',j; END IF;
  -- Future slots exclude sessions that already started, even on Monday.
  j := admin_get_weekly_dashboard_summary('2026-10-19 05:00:01Z');
  IF (j->>'availableSlots')::int<>6 THEN RAISE EXCEPTION 'Past capacity included'; END IF;
  INSERT INTO bookings(session_id,status) SELECT sunday,'reserved' FROM generate_series(1,81);
  IF (admin_get_weekly_dashboard_summary('2026-10-19 10:00:00Z')->>'reservations')::int<>86 THEN RAISE EXCEPTION 'Summary truncated at agenda limit'; END IF;
  j := admin_get_weekly_dashboard_summary('2026-10-19 04:59:59Z');
  IF j->>'startDate'<>'2026-10-12' OR (j->>'reservations')::int<>1 THEN RAISE EXCEPTION 'Sunday rollover wrong'; END IF;
  j := admin_get_weekly_dashboard_summary('2026-10-26 05:00:00Z');
  IF j->>'startDate'<>'2026-10-26' OR (j->>'reservations')::int<>1 THEN RAISE EXCEPTION 'Next Monday rollover wrong'; END IF;
  j := admin_get_weekly_dashboard_summary('2027-01-01 10:00:00Z');
  IF j->>'startDate'<>'2026-12-28' OR j->>'endDate'<>'2027-01-03' OR (j->>'reservations')::int<>0 OR (j->>'availableSlots')::int<>0 THEN RAISE EXCEPTION 'Year rollover or empty week wrong'; END IF;
  DELETE FROM admin_roster_by_distance WHERE session_id=sunday;
  IF admin_get_weekly_dashboard_summary('2026-10-19 10:00:00Z')->>'availableSlots' IS NOT NULL THEN RAISE EXCEPTION 'Missing capacity fabricated'; END IF;
  INSERT INTO admin_roster_by_distance VALUES(sunday,1,8);
  IF (admin_get_weekly_dashboard_summary('2026-10-19 10:00:00Z')->>'availableSlots')::int<>0 THEN RAISE EXCEPTION 'Negative capacity'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  BEGIN PERFORM admin_get_weekly_dashboard_summary(); RAISE EXCEPTION 'Student allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM admin_get_weekly_dashboard_summary(); RAISE EXCEPTION 'Anonymous allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon','public.admin_get_weekly_dashboard_summary(timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Anon granted'; END IF;
END $$;
ROLLBACK;
