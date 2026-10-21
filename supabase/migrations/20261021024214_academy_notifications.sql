-- Additive in-app announcements. Memberships and payments are never modified.
CREATE TABLE IF NOT EXISTS public.academy_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  audience text NOT NULL CHECK (audience IN ('all','selected')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','inactive')),
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES public.profiles(id)
);
CREATE TABLE IF NOT EXISTS public.academy_notification_recipients (
  notification_id uuid NOT NULL REFERENCES public.academy_notifications(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY(notification_id,student_id)
);
CREATE INDEX IF NOT EXISTS academy_notification_recipient_student_idx ON public.academy_notification_recipients(student_id,notification_id);
CREATE TABLE IF NOT EXISTS public.academy_notification_dismissals (
  notification_id uuid NOT NULL REFERENCES public.academy_notifications(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  closed_by uuid NOT NULL REFERENCES public.profiles(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(notification_id,student_id)
);
ALTER TABLE public.academy_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_notification_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_notifications, public.academy_notification_recipients, public.academy_notification_dismissals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_notifications, public.academy_notification_recipients, public.academy_notification_dismissals TO authenticated;
DROP POLICY IF EXISTS academy_notification_admin_read ON public.academy_notifications;
CREATE POLICY academy_notification_admin_read ON public.academy_notifications FOR SELECT TO authenticated USING(public.is_admin_user());
DROP POLICY IF EXISTS academy_recipient_admin_read ON public.academy_notification_recipients;
CREATE POLICY academy_recipient_admin_read ON public.academy_notification_recipients FOR SELECT TO authenticated USING(public.is_admin_user());
DROP POLICY IF EXISTS academy_dismissal_admin_read ON public.academy_notification_dismissals;
CREATE POLICY academy_dismissal_admin_read ON public.academy_notification_dismissals FOR SELECT TO authenticated USING(public.is_admin_user());

CREATE OR REPLACE FUNCTION public.admin_create_academy_notification(p_title text,p_body text,p_audience text,p_student_ids uuid[] DEFAULT '{}',p_expires_at timestamptz DEFAULT NULL,p_publish boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administración puede crear avisos'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 100 OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Título o mensaje no válido'; END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all','selected') OR p_publish IS NULL THEN RAISE EXCEPTION 'Destinatarios no válidos'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'La fecha de finalización debe estar en el futuro'; END IF;
  IF p_audience='selected' AND (coalesce(cardinality(p_student_ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(p_student_ids) s WHERE s IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE id=s))) THEN RAISE EXCEPTION 'Selecciona alumnos válidos'; END IF;
  IF cardinality(p_student_ids)>1000 THEN RAISE EXCEPTION 'Demasiados destinatarios'; END IF;
  INSERT INTO public.academy_notifications(title,body,audience,expires_at,created_by,status,published_at)
  VALUES(btrim(p_title),btrim(p_body),p_audience,p_expires_at,auth.uid(),CASE WHEN p_publish THEN 'published' ELSE 'draft' END,CASE WHEN p_publish THEN now() END) RETURNING id INTO v_id;
  IF p_audience='selected' THEN INSERT INTO public.academy_notification_recipients SELECT v_id,s FROM (SELECT DISTINCT unnest(p_student_ids) s) x; END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_academy_notification_status(p_notification_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_notice public.academy_notifications;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administración puede gestionar avisos'; END IF;
  SELECT * INTO v_notice FROM public.academy_notifications WHERE id=p_notification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aviso no encontrado'; END IF;
  IF p_status='published' AND v_notice.status='draft' AND (v_notice.expires_at IS NULL OR v_notice.expires_at>now()) THEN
    UPDATE public.academy_notifications SET status='published',published_at=now() WHERE id=p_notification_id;
  ELSIF p_status='inactive' AND v_notice.status IN ('draft','published') THEN
    UPDATE public.academy_notifications SET status='inactive',deactivated_at=now(),deactivated_by=auth.uid() WHERE id=p_notification_id;
  ELSE RAISE EXCEPTION 'Este aviso ya cambió de estado. Actualiza la lista'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_academy_notifications()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administración puede consultar avisos'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC,n.id) FROM (
    SELECT a.*,(SELECT count(*) FROM public.academy_notification_recipients r WHERE r.notification_id=a.id) AS recipient_count,
    (SELECT count(*) FROM public.academy_notification_dismissals d WHERE d.notification_id=a.id) AS closed_count
    FROM public.academy_notifications a ORDER BY a.created_at DESC,a.id LIMIT 200
  ) n),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.get_student_notification_feed(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_membership public.student_memberships; v_expired boolean := false; v_key text := ''; v_notices jsonb;
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
  RETURN jsonb_build_object('notices',v_notices,'membership',jsonb_build_object('expired',v_expired,'state_key',v_key));
END $$;

CREATE OR REPLACE FUNCTION public.dismiss_academy_notification(p_student_id uuid,p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND coalesce(is_active,true) AND role IN ('student','guardian'))
    OR NOT public.can_access_student(p_student_id) THEN RAISE EXCEPTION 'No tienes acceso al alumno'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.academy_notifications n WHERE n.id=p_notification_id AND n.status='published' AND n.published_at<=now() AND (n.expires_at IS NULL OR n.expires_at>now()) AND (n.audience='all' OR EXISTS(SELECT 1 FROM public.academy_notification_recipients r WHERE r.notification_id=n.id AND r.student_id=p_student_id))) THEN RAISE EXCEPTION 'Aviso no disponible'; END IF;
  INSERT INTO public.academy_notification_dismissals(notification_id,student_id,closed_by) VALUES(p_notification_id,p_student_id,auth.uid()) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_academy_notification(text,text,text,uuid[],timestamptz,boolean),public.admin_set_academy_notification_status(uuid,text),public.admin_list_academy_notifications(),public.get_student_notification_feed(uuid),public.dismiss_academy_notification(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_academy_notification(text,text,text,uuid[],timestamptz,boolean),public.admin_set_academy_notification_status(uuid,text),public.admin_list_academy_notifications(),public.get_student_notification_feed(uuid),public.dismiss_academy_notification(uuid,uuid) TO authenticated;
