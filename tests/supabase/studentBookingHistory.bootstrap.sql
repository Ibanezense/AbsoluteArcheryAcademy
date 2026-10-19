CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE students(id uuid PRIMARY KEY,self_profile_id uuid);
CREATE TABLE student_guardians(student_id uuid,guardian_profile_id uuid);
CREATE FUNCTION resolve_accessible_student_id(p_student_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
IF EXISTS(SELECT 1 FROM students WHERE id=p_student_id AND self_profile_id=auth.uid()) OR EXISTS(SELECT 1 FROM student_guardians WHERE student_id=p_student_id AND guardian_profile_id=auth.uid()) THEN RETURN p_student_id; END IF;
RAISE EXCEPTION 'No tienes acceso a este alumno'; END$$;
CREATE TABLE student_memberships(id uuid PRIMARY KEY,student_id uuid,start_date date,end_date date,status text,created_at timestamptz DEFAULT now(),membership_code text);
CREATE TABLE sessions(id uuid PRIMARY KEY,start_at timestamptz,end_at timestamptz);
CREATE TABLE bookings(id uuid PRIMARY KEY,student_id uuid,session_id uuid,status text,distance_m integer,bow_usage_type text,bow_poundage integer,active_membership_id uuid,admin_notes text);
CREATE TABLE booking_cancellations(id uuid PRIMARY KEY,booking_id uuid,cancellation_source text,resolution text,created_at timestamptz DEFAULT now());
CREATE TABLE attendance_reversals(booking_id uuid,weekly_attendance_id uuid);
CREATE TABLE student_weekly_attendance(id uuid PRIMARY KEY,student_id uuid,student_membership_id uuid,week_end date,note text);
CREATE TABLE membership_class_expirations(id uuid PRIMARY KEY,student_id uuid,student_membership_id uuid,expired_at timestamptz,normal_classes integer,recovery_classes integer);
INSERT INTO students VALUES('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO student_guardians VALUES('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO student_memberships VALUES('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',current_date-10,current_date+20,'active',now(),'CURRENT'),('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','2025-01-01','2025-01-31','historical',now(),'OLD');
INSERT INTO sessions SELECT md5('session'||n)::uuid,'2025-01-10 15:00+00'::timestamptz+n*interval '1 minute','2025-01-10 16:00+00'::timestamptz+n*interval '1 minute' FROM generate_series(1,26)n;
INSERT INTO bookings SELECT md5('booking'||n)::uuid,'00000000-0000-0000-0000-000000000001',md5('session'||n)::uuid,CASE WHEN n<=24 THEN 'cancelled' ELSE 'attended' END,18,'own',NULL,CASE WHEN n<=2 THEN '30000000-0000-0000-0000-000000000001'::uuid ELSE '30000000-0000-0000-0000-000000000002'::uuid END,NULL FROM generate_series(1,26)n;
INSERT INTO student_weekly_attendance VALUES('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','2025-01-19','Historical');
INSERT INTO membership_class_expirations VALUES('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','2025-02-01 05:00+00',2,1);

INSERT INTO sessions SELECT md5('future'||n)::uuid,now()+n*interval '1 day',now()+n*interval '1 day'+interval '1 hour' FROM generate_series(1,2)n;
INSERT INTO bookings SELECT md5('futurebooking'||n)::uuid,'00000000-0000-0000-0000-000000000001',md5('future'||n)::uuid,'reserved',18,'own',NULL,'30000000-0000-0000-0000-000000000001',NULL FROM generate_series(1,2)n;
INSERT INTO bookings VALUES('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',md5('session1')::uuid,'attended',18,'own',NULL,'30000000-0000-0000-0000-000000000002',NULL);
INSERT INTO attendance_reversals VALUES('60000000-0000-0000-0000-000000000001',NULL);
INSERT INTO booking_cancellations(id,booking_id,cancellation_source,resolution) VALUES('70000000-0000-0000-0000-000000000001',md5('booking1')::uuid,'student','justified');
