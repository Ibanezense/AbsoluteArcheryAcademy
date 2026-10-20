-- Confirmed identities only; no score replication and no automatic matching.
CREATE TABLE IF NOT EXISTS public.student_progress_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.students(id),
 source text NOT NULL CHECK(source IN ('academy_controls','tournament_engine')), external_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','confirmed','revoked')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference)) BETWEEN 3 AND 1000),
 confirmed_by uuid REFERENCES public.profiles(id),confirmed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS student_progress_one_confirmed_subject ON public.student_progress_links(student_id,source) WHERE status='confirmed';
CREATE UNIQUE INDEX IF NOT EXISTS student_progress_one_confirmed_external ON public.student_progress_links(source,external_id) WHERE status='confirmed';
CREATE TABLE IF NOT EXISTS public.student_progress_link_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),link_id uuid NOT NULL REFERENCES public.student_progress_links(id),actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK(action IN ('confirm','revoke')),before_data jsonb,after_data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_progress_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress_link_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_progress_links,public.student_progress_link_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.student_progress_links,public.student_progress_link_audit TO authenticated;
DROP POLICY IF EXISTS student_progress_links_read ON public.student_progress_links;
CREATE POLICY student_progress_links_read ON public.student_progress_links FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND coalesce(is_active,true)) AND public.can_access_student(student_id));
DROP POLICY IF EXISTS student_progress_audit_admin ON public.student_progress_link_audit;
CREATE POLICY student_progress_audit_admin ON public.student_progress_link_audit FOR SELECT TO authenticated USING (
 public.is_admin_user() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)));
CREATE OR REPLACE FUNCTION public.student_progress_context(p_student_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_distance integer;v_link jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 v_id:=public.resolve_accessible_student_id(p_student_id);
 SELECT current_distance_m INTO v_distance FROM students WHERE id=v_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(l) INTO v_link FROM student_progress_links l WHERE student_id=v_id AND source='academy_controls' AND status='confirmed';
 RETURN jsonb_build_object('student_id',v_id,'assigned_distance_m',v_distance,'link',v_link);
END $$;
CREATE OR REPLACE FUNCTION public.admin_confirm_progress_link(p_student_id uuid,p_external_id uuid,p_evidence text,p_expected_link_id uuid,p_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old student_progress_links;v_new student_progress_links;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_external_id IS NULL OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'invalid_evidence' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM students WHERE id=p_student_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_student' USING ERRCODE='22023'; END IF;
 -- Serialize external identities across different academy students as well.
 PERFORM pg_advisory_xact_lock(hashtextextended('academy_controls:'||p_external_id::text,0));
 SELECT * INTO v_old FROM student_progress_links WHERE student_id=p_student_id AND source='academy_controls' AND status='confirmed' FOR UPDATE;
 IF v_old.id IS DISTINCT FROM p_expected_link_id OR v_old.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'link_conflict' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM student_progress_links WHERE source='academy_controls' AND external_id=p_external_id AND status='confirmed' AND student_id<>p_student_id) THEN RAISE EXCEPTION 'identity_conflict' USING ERRCODE='23505'; END IF;
 IF v_old.id IS NOT NULL THEN
  UPDATE student_progress_links SET status='revoked',revision=revision+1,updated_at=now() WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_new.id,auth.uid(),'revoke',to_jsonb(v_old),to_jsonb(v_new));
 END IF;
 INSERT INTO student_progress_links(student_id,source,external_id,status,evidence_reference,confirmed_by,confirmed_at)
 VALUES(p_student_id,'academy_controls',p_external_id,'confirmed',btrim(p_evidence),auth.uid(),now()) RETURNING * INTO v_new;
 INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_new.id,auth.uid(),'confirm',NULL,to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
CREATE OR REPLACE FUNCTION public.admin_revoke_progress_link(p_student_id uuid,p_link_id uuid,p_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old student_progress_links;v_new student_progress_links;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM students WHERE id=p_student_id FOR UPDATE;
 SELECT * INTO v_old FROM student_progress_links WHERE id=p_link_id AND student_id=p_student_id AND source='academy_controls' AND status='confirmed' FOR UPDATE;
 IF v_old.id IS NULL OR v_old.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'link_conflict' USING ERRCODE='40001'; END IF;
 UPDATE student_progress_links SET status='revoked',revision=revision+1,updated_at=now() WHERE id=v_old.id RETURNING * INTO v_new;
 INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_new.id,auth.uid(),'revoke',to_jsonb(v_old),to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
REVOKE ALL ON FUNCTION public.student_progress_context(uuid),public.admin_confirm_progress_link(uuid,uuid,text,uuid,integer),public.admin_revoke_progress_link(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.student_progress_context(uuid),public.admin_confirm_progress_link(uuid,uuid,text,uuid,integer),public.admin_revoke_progress_link(uuid,uuid,integer) TO authenticated;
