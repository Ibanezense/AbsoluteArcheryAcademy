-- Isolated fixtures only. Never execute against the academy database.
BEGIN;
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO profiles(id,role) VALUES('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','student');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE s uuid; purchase uuid; cycle uuid; payment uuid; intro uuid; report record; j jsonb;
  current_month date:=date_trunc('month',now() AT TIME ZONE 'America/Lima')::date;
  expected_revenue numeric;
BEGIN
  INSERT INTO students(full_name) VALUES('Finance QA') RETURNING id INTO s;
  INSERT INTO membership_purchases(purchased_at) VALUES('2026-08-31 23:30:00-05') RETURNING id INTO purchase;
  INSERT INTO student_memberships(student_id,start_date,status,membership_origin,purchase_id,custom_name,created_at) VALUES(s,'2026-09-15','active','paid',purchase,'Mensual','2026-09-01 10:00:00Z') RETURNING id INTO cycle;
  INSERT INTO student_membership_payments(student_id,student_membership_id,created_at,paid_at,amount,payment_status,payment_method,source) VALUES(s,cycle,'2026-09-01 10:00:00Z','2026-10-19 17:00:00Z',240,'paid','yape','admin_assignment') RETURNING id INTO payment;
  SELECT * INTO report FROM get_finances_sales_report('2026-08-01','2026-09-01') WHERE payment_id=payment;
  IF NOT FOUND OR report.sale_at<>'2026-08-31 23:30:00-05'::timestamptz OR report.paid_at<>'2026-10-19 17:00:00Z'::timestamptz OR report.amount_paid<>240 THEN RAISE EXCEPTION 'Original sale/collection dates not preserved'; END IF;
  IF EXISTS(SELECT 1 FROM get_finances_sales_report('2026-10-01','2026-11-01') WHERE payment_id=payment) THEN RAISE EXCEPTION 'Regularization leaked into October'; END IF;
  -- Status changes recalculate the original cohort, never the month of confirmation.
  UPDATE student_membership_payments SET payment_status='pending' WHERE id=payment;
  j:=get_finances_sales_dashboard('2026-08-01','2026-09-01','2026-10-19');
  IF (j->>'paid_month')::numeric<>0 OR (j->>'pending_month')::numeric<>240 OR (j->>'projection_month')::numeric<>240 THEN RAISE EXCEPTION 'Pending sale cohort wrong: %',j; END IF;
  UPDATE student_membership_payments SET payment_status='paid' WHERE id=payment;
  j:=get_finances_sales_dashboard('2026-08-01','2026-09-01','2026-10-19');
  IF (j->>'paid_month')::numeric<>240 OR (j->>'pending_month')::numeric<>0 OR (j->>'overdue_count')::int<>3 THEN RAISE EXCEPTION 'Sales dashboard or legacy fields wrong'; END IF;
  -- A late-created cycle must not dictate the sale date of the whole purchase.
  INSERT INTO student_membership_payments(student_id,student_membership_id,created_at,paid_at,amount,payment_status,source) VALUES(s,cycle,'2026-10-01 10:00Z','2026-10-19 17:00Z',999,'paid','migration');
  IF (SELECT sum(amount_paid) FROM get_finances_sales_report('2026-08-01','2026-09-01'))<>240 THEN RAISE EXCEPTION 'Migration money included'; END IF;
  -- Legacy payments without a purchase use their original creation, not membership start.
  INSERT INTO student_memberships(student_id,start_date,status,membership_origin,custom_name) VALUES(s,'2026-10-15','active','paid','Legacy') RETURNING id INTO cycle;
  INSERT INTO student_membership_payments(student_id,student_membership_id,created_at,paid_at,amount,payment_status,source) VALUES(s,cycle,'2026-09-30 23:59:59-05','2026-10-19 17:00Z',100,'paid',NULL);
  IF (SELECT sum(amount_paid) FROM get_finances_sales_report('2026-09-01','2026-10-01'))<>100 THEN RAISE EXCEPTION 'Fallback or Lima boundary wrong'; END IF;
  INSERT INTO intro_clients(full_name) VALUES('Intro QA') RETURNING id INTO intro;
  INSERT INTO intro_payments(intro_client_id,paid_at,amount,payment_status) VALUES(intro,'2026-10-05 12:00-05',29,'paid'),(intro,'2026-10-06 12:00-05',29,'pending');
  j:=get_finances_sales_dashboard('2026-10-01','2026-11-01','2026-10-19');
  IF (j->>'paid_month')::numeric<>29 THEN RAISE EXCEPTION 'Confirmed intro semantics changed'; END IF;
  -- Home only counts confirmed membership sales, preserving its original scope.
  INSERT INTO membership_purchases(purchased_at) VALUES(now()) RETURNING id INTO purchase;
  INSERT INTO student_memberships(student_id,start_date,status,membership_origin,purchase_id,custom_name) VALUES(s,current_month,'active','paid',purchase,'Current QA') RETURNING id INTO cycle;
  INSERT INTO student_membership_payments(student_id,student_membership_id,paid_at,amount,payment_status,source) VALUES(s,cycle,now(),1234,'paid','admin_assignment'),(s,cycle,NULL,45,'pending','admin_assignment'),(s,cycle,now(),999,'paid','migration');
  INSERT INTO intro_payments(intro_client_id,paid_at,amount,payment_status) VALUES(intro,now(),53,'paid');
  j:=get_admin_dashboard_operational_sales_data();
  expected_revenue:=1234+CASE current_month WHEN '2026-08-01'::date THEN 240 WHEN '2026-09-01'::date THEN 100 ELSE 0 END;
  IF (j#>>'{monthly,revenueThisMonth}')::numeric<>expected_revenue THEN RAISE EXCEPTION 'Home uses collection, pending, intro or migration money: %',j; END IF;
  IF (j#>>'{today,reservationsToday}')::int<>7 OR (j#>>'{monthly,activeStudents}')::int<>41 THEN RAISE EXCEPTION 'Other home metrics changed'; END IF;
  IF (SELECT paid_at FROM student_membership_payments WHERE id=payment)<>'2026-10-19 17:00Z'::timestamptz THEN RAISE EXCEPTION 'Collection timestamp overwritten'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  BEGIN PERFORM get_finances_sales_report('2026-08-01','2026-09-01'); RAISE EXCEPTION 'Student allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM get_finances_sales_dashboard('2026-08-01','2026-09-01','2026-10-19'); RAISE EXCEPTION 'Student dashboard allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM get_admin_dashboard_operational_sales_data(); RAISE EXCEPTION 'Student home allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM get_finances_sales_report('2026-08-01','2026-09-01'); RAISE EXCEPTION 'Anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon','public.get_finances_sales_report(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Anon granted'; END IF;
  IF has_function_privilege('anon','public.get_finances_sales_dashboard(date,date,date)','EXECUTE') OR has_function_privilege('anon','public.get_admin_dashboard_operational_sales_data()','EXECUTE') THEN RAISE EXCEPTION 'Anon dashboard granted'; END IF;
END $$;
ROLLBACK;
