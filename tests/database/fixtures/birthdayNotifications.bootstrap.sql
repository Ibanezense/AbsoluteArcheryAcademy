DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE students(id uuid PRIMARY KEY, full_name text NOT NULL,date_of_birth date,operational_status text,self_profile_id uuid REFERENCES profiles(id),account_access_blocked boolean NOT NULL DEFAULT false);
CREATE TABLE student_guardians(student_id uuid REFERENCES students(id),guardian_profile_id uuid REFERENCES profiles(id));
CREATE FUNCTION is_admin_user() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND is_active)$$;
CREATE FUNCTION can_access_student(p uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT FROM students s WHERE s.id=p AND (s.self_profile_id=auth.uid() OR EXISTS(SELECT FROM student_guardians g WHERE g.student_id=s.id AND g.guardian_profile_id=auth.uid()))) OR is_admin_user()$$;
CREATE TABLE student_memberships(id uuid PRIMARY KEY,student_id uuid,status text,start_date date,created_at timestamptz);
