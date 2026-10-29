-- Daily birthday projection. No memberships, bookings, payments or balances are changed.
CREATE TABLE IF NOT EXISTS public.student_birthday_days (
  local_date date PRIMARY KEY CHECK (isfinite(local_date)),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.student_birthday_day_students (
  local_date date NOT NULL REFERENCES public.student_birthday_days(local_date) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY(local_date,student_id)
);
CREATE TABLE IF NOT EXISTS public.student_birthday_dismissals (
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  celebration_year integer NOT NULL CHECK (celebration_year BETWEEN 1 AND 9999),
  celebration_on date NOT NULL CHECK (isfinite(celebration_on)),
  closed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(student_id,celebration_year),
  CHECK (extract(year FROM celebration_on)=celebration_year)
);
ALTER TABLE public.student_birthday_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_birthday_day_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_birthday_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_birthday_days,public.student_birthday_day_students,public.student_birthday_dismissals FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.birthday_anniversary(p_date_of_birth date,p_reference_date date)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE v_year integer; v_month integer; v_day integer;
BEGIN
  IF p_date_of_birth IS NULL OR p_reference_date IS NULL OR NOT isfinite(p_date_of_birth)
    OR NOT isfinite(p_reference_date) OR p_date_of_birth>p_reference_date THEN RETURN NULL; END IF;
  v_year:=extract(year FROM p_reference_date); v_month:=extract(month FROM p_date_of_birth); v_day:=extract(day FROM p_date_of_birth);
  IF v_month=2 AND v_day=29 AND NOT (v_year%4=0 AND (v_year%100<>0 OR v_year%400=0)) THEN v_day:=28; END IF;
  RETURN make_date(v_year,v_month,v_day);
END $$;
REVOKE ALL ON FUNCTION public.birthday_anniversary(date,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.birthday_server_calendar()
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT jsonb_build_object('today_lima',(now() AT TIME ZONE 'America/Lima')::date,
    'valid_for_ms',greatest(0,floor(extract(epoch FROM ((((now() AT TIME ZONE 'America/Lima')::date+1)::timestamp AT TIME ZONE 'America/Lima')-now()))*1000)))
$$;
REVOKE ALL ON FUNCTION public.birthday_server_calendar() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ensure_student_birthday_day()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  -- The generator never locks student rows: edits hold one before entering their AFTER trigger.
  PERFORM pg_advisory_xact_lock(189312840,1);
  IF EXISTS(SELECT 1 FROM public.student_birthday_days WHERE local_date=v_today AND completed_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ready',true,'today_lima',v_today);
  END IF;
  INSERT INTO public.student_birthday_days(local_date) VALUES(v_today) ON CONFLICT DO NOTHING;
  DELETE FROM public.student_birthday_day_students WHERE local_date=v_today;
  INSERT INTO public.student_birthday_day_students(local_date,student_id)
    SELECT v_today,s.id FROM public.students s
    WHERE s.operational_status IN ('active','expired','paused')
      AND public.birthday_anniversary(s.date_of_birth,v_today)=v_today;
  UPDATE public.student_birthday_days SET completed_at=clock_timestamp() WHERE local_date=v_today;
  RETURN jsonb_build_object('ready',true,'today_lima',v_today);
END $$;
REVOKE ALL ON FUNCTION public.ensure_student_birthday_day() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_student_birthday_day() TO service_role;

CREATE OR REPLACE FUNCTION public.adjust_student_birthday_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  -- Edits of different students may proceed together; generation remains exclusive.
  PERFORM pg_advisory_xact_lock_shared(189312840,1);
  IF EXISTS(SELECT 1 FROM public.student_birthday_days WHERE local_date=v_today AND completed_at IS NOT NULL) THEN
    IF NEW.operational_status IN ('active','expired','paused') AND public.birthday_anniversary(NEW.date_of_birth,v_today)=v_today THEN
      INSERT INTO public.student_birthday_day_students(local_date,student_id) VALUES(v_today,NEW.id) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.student_birthday_day_students WHERE local_date=v_today AND student_id=NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.adjust_student_birthday_day() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS students_adjust_birthday_day ON public.students;
CREATE TRIGGER students_adjust_birthday_day AFTER INSERT OR UPDATE OF date_of_birth,operational_status
ON public.students FOR EACH ROW EXECUTE FUNCTION public.adjust_student_birthday_day();

CREATE OR REPLACE FUNCTION public.prepare_student_birthday_day(p_student_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
  IF v_role IS NULL OR v_role NOT IN ('admin','student','guardian') THEN RAISE EXCEPTION 'No tienes acceso' USING ERRCODE='42501'; END IF;
  IF v_role='admin' THEN
    IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No tienes acceso' USING ERRCODE='42501'; END IF;
  ELSIF p_student_id IS NULL OR NOT public.can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'No tienes acceso al alumno' USING ERRCODE='42501';
  END IF;
  RETURN public.ensure_student_birthday_day();
END $$;
REVOKE ALL ON FUNCTION public.prepare_student_birthday_day(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_student_birthday_day(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_student_birthday_flags(p_student_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Lima')::date; v_ready boolean; v_students jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_active=true)
    THEN RAISE EXCEPTION 'No tienes acceso' USING ERRCODE='42501'; END IF;
  IF p_student_ids IS NULL OR cardinality(p_student_ids)>500 OR array_position(p_student_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Identificadores no válidos' USING ERRCODE='22023'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.student_birthday_days WHERE local_date=v_today AND completed_at IS NOT NULL) INTO v_ready;
  SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',s.id,'is_birthday_today',
    v_ready AND s.operational_status IN ('active','expired','paused') AND EXISTS(SELECT 1 FROM public.student_birthday_day_students d WHERE d.local_date=v_today AND d.student_id=s.id)) ORDER BY s.id),'[]'::jsonb)
    INTO v_students FROM public.students s WHERE s.id=ANY(p_student_ids);
  RETURN jsonb_build_object('ready',v_ready,'calendar',public.birthday_server_calendar(),'students',v_students);
END $$;
REVOKE ALL ON FUNCTION public.get_admin_student_birthday_flags(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_student_birthday_flags(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_student_birthday(p_student_id uuid,p_celebration_year integer,p_celebration_on date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Lima')::date; v_student public.students; v_role text; v_inserted integer;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true AND role IN ('student','guardian');
  IF v_role IS NULL OR NOT public.can_access_student(p_student_id) THEN RAISE EXCEPTION 'No tienes acceso al alumno' USING ERRCODE='42501'; END IF;
  IF p_student_id IS NULL OR p_celebration_year IS NULL OR p_celebration_year NOT BETWEEN 1 AND 9999 OR p_celebration_on IS NULL OR NOT isfinite(p_celebration_on) OR extract(year FROM p_celebration_on)<>p_celebration_year THEN
    RAISE EXCEPTION 'Celebración no válida' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_student FROM public.students WHERE id=p_student_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_student(p_student_id) THEN RAISE EXCEPTION 'No tienes acceso al alumno' USING ERRCODE='42501'; END IF;
  IF v_role='student' AND v_student.account_access_blocked THEN RAISE EXCEPTION 'No tienes acceso al alumno' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.student_birthday_dismissals WHERE student_id=p_student_id AND celebration_year=p_celebration_year) THEN
    RETURN jsonb_build_object('success',true,'already_closed',true,'celebration_year',p_celebration_year);
  END IF;
  IF p_celebration_year<>extract(year FROM v_today) OR p_celebration_on<>v_today
    OR v_student.operational_status NOT IN ('active','expired','paused') OR v_student.operational_status IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.student_birthday_days day JOIN public.student_birthday_day_students member USING(local_date)
      WHERE day.local_date=v_today AND day.completed_at IS NOT NULL AND member.student_id=p_student_id) THEN
    RAISE EXCEPTION 'BIRTHDAY_NOT_CURRENT' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.student_birthday_dismissals(student_id,celebration_year,celebration_on,closed_by_profile_id)
    VALUES(p_student_id,p_celebration_year,p_celebration_on,auth.uid()) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  RETURN jsonb_build_object('success',true,'already_closed',v_inserted=0,'celebration_year',p_celebration_year);
END $$;
REVOKE ALL ON FUNCTION public.dismiss_student_birthday(uuid,integer,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dismiss_student_birthday(uuid,integer,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_notification_feed(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_membership public.student_memberships; v_expired boolean := false; v_key text := ''; v_notices jsonb; v_birthday jsonb := NULL; v_today date:=(now() AT TIME ZONE 'America/Lima')::date; v_ready boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND coalesce(is_active,true) AND role IN ('student','guardian'))
    OR NOT public.can_access_student(p_student_id) THEN RAISE EXCEPTION 'No tienes acceso al alumno'; END IF;
  -- Persisted membership status is authoritative: attendance-based plans can outlive their old end_date.
  IF NOT EXISTS(SELECT 1 FROM public.student_memberships WHERE student_id=p_student_id AND status='active') THEN
    SELECT * INTO v_membership FROM public.student_memberships WHERE student_id=p_student_id AND status IN ('expired','consumed','historical') ORDER BY start_date DESC,created_at DESC,id DESC LIMIT 1;
    v_expired := FOUND AND v_membership.status IN ('expired','consumed');
    IF v_expired THEN v_key := v_membership.id::text || ':' || v_membership.status; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body) ORDER BY n.published_at,n.id),'[]'::jsonb) INTO v_notices
  FROM public.academy_notifications n
  WHERE n.status='published' AND n.published_at<=now() AND (n.expires_at IS NULL OR n.expires_at>now())
    AND (n.audience='all' OR EXISTS(SELECT 1 FROM public.academy_notification_recipients r WHERE r.notification_id=n.id AND r.student_id=p_student_id))
    AND NOT EXISTS(SELECT 1 FROM public.academy_notification_dismissals d WHERE d.notification_id=n.id AND d.student_id=p_student_id);
  SELECT EXISTS(SELECT 1 FROM public.student_birthday_days WHERE local_date=v_today AND completed_at IS NOT NULL) INTO v_ready;
  IF v_ready THEN
    SELECT jsonb_build_object('id','birthday:'||s.id::text||':'||extract(year FROM v_today)::integer::text,
      'source','birthday','celebration_year',extract(year FROM v_today)::integer,'celebration_on',v_today,
      'title','¡Feliz cumpleaños, '||s.full_name||'!',
      'body','Todo el equipo de Absolute Archery te desea un gran día. ¡Que este nuevo año venga con muchas flechas al centro!')
    INTO v_birthday FROM public.students s JOIN public.student_birthday_day_students d ON d.student_id=s.id AND d.local_date=v_today
    JOIN public.profiles p ON p.id=auth.uid() AND p.is_active=true AND p.role IN ('student','guardian')
    WHERE s.id=p_student_id AND s.operational_status IN ('active','expired','paused')
      AND (p.role='guardian' OR NOT s.account_access_blocked)
      AND NOT EXISTS(SELECT 1 FROM public.student_birthday_dismissals closed WHERE closed.student_id=s.id AND closed.celebration_year=extract(year FROM v_today)::integer);
  END IF;
  RETURN jsonb_build_object('birthday_version',1,'birthday_ready',v_ready,'calendar',public.birthday_server_calendar(),'birthday',v_birthday,'notices',v_notices,'membership',jsonb_build_object('expired',v_expired,'state_key',v_key));
END $$;
