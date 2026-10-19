-- Minimal disposable-only schema matching the columns used by the migration.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id), role text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_active) $$;
CREATE TABLE public.intro_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),full_name text NOT NULL,phone text,age integer,created_at timestamptz DEFAULT now());
CREATE TABLE public.students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),full_name text NOT NULL,dni text,phone text);
CREATE TABLE public.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),start_at timestamptz NOT NULL);
CREATE TABLE public.bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),intro_client_id uuid REFERENCES public.intro_clients(id),student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,session_id uuid REFERENCES public.sessions(id),status text NOT NULL);
CREATE TABLE public.student_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,start_date date NOT NULL,end_date date,status text NOT NULL,membership_origin text NOT NULL,created_at timestamptz DEFAULT now());
