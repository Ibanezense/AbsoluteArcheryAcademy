-- Additive TE identity coordination; no sporting data or external calls in SQL.
ALTER TABLE public.student_progress_links ALTER COLUMN external_id TYPE text USING external_id::text;
DROP INDEX public.student_progress_one_confirmed_subject;
CREATE UNIQUE INDEX student_progress_one_confirmed_subject ON public.student_progress_links(student_id,source) WHERE status='confirmed' AND source='academy_controls';
CREATE UNIQUE INDEX student_progress_engine_pair ON public.student_progress_links(student_id,external_id) WHERE source='tournament_engine';
CREATE UNIQUE INDEX student_progress_engine_claim ON public.student_progress_links(external_id) WHERE source='tournament_engine' AND status IN ('pending','confirmed');
ALTER TABLE public.student_progress_link_audit DROP CONSTRAINT student_progress_link_audit_action_check;
ALTER TABLE public.student_progress_link_audit ADD CONSTRAINT student_progress_link_audit_action_check CHECK(action IN ('confirm','revoke','request'));
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
 IF EXISTS(SELECT 1 FROM student_progress_links WHERE source='academy_controls' AND external_id=p_external_id::text AND status='confirmed' AND student_id<>p_student_id) THEN RAISE EXCEPTION 'identity_conflict' USING ERRCODE='23505'; END IF;
 IF v_old.id IS NOT NULL THEN
  UPDATE student_progress_links SET status='revoked',revision=revision+1,updated_at=now() WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_new.id,auth.uid(),'revoke',to_jsonb(v_old),to_jsonb(v_new));
 END IF;
 INSERT INTO student_progress_links(student_id,source,external_id,status,evidence_reference,confirmed_by,confirmed_at)
 VALUES(p_student_id,'academy_controls',p_external_id::text,'confirmed',btrim(p_evidence),auth.uid(),now()) RETURNING * INTO v_new;
 INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_new.id,auth.uid(),'confirm',NULL,to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
CREATE TABLE public.student_progress_link_operations (
 id uuid PRIMARY KEY,link_id uuid NOT NULL REFERENCES public.student_progress_links(id),student_id uuid NOT NULL REFERENCES public.students(id),external_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('confirm','revoke')),state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','superseded')),
 generation integer NOT NULL CHECK(generation>0),intent jsonb NOT NULL,evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 5 AND 1000),requested_by uuid NOT NULL REFERENCES public.profiles(id),
 last_error_code text CHECK(last_error_code IN ('remote_unavailable','identity_conflict','invalid_source')),
 lease_token uuid,lease_owner uuid REFERENCES public.profiles(id),lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,
 requested_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),remote_checked_at timestamptz
);
CREATE INDEX student_progress_operation_student ON public.student_progress_link_operations(student_id,updated_at DESC);
ALTER TABLE public.student_progress_link_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_progress_link_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.student_progress_link_operations TO authenticated;
CREATE POLICY engine_operations_admin ON public.student_progress_link_operations FOR SELECT TO authenticated USING(public.is_admin_user() AND EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)));
CREATE FUNCTION public.engine_operation_public(o public.student_progress_link_operations) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',o.id,'link_id',o.link_id,'student_id',o.student_id,'external_id',o.external_id,'action',o.action,'state',o.state,'generation',o.generation,'last_error_code',o.last_error_code,'requested_at',o.requested_at,'updated_at',o.updated_at)
$$;
REVOKE ALL ON FUNCTION public.engine_operation_public(public.student_progress_link_operations) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.engine_progress_context(p_student_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_links jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 v_id:=public.resolve_accessible_student_id(p_student_id);
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) INTO v_links FROM student_progress_links l WHERE l.student_id=v_id AND l.source='tournament_engine' AND l.status='confirmed';
 RETURN jsonb_build_object('student_id',v_id,'links',v_links);
END $$;
CREATE FUNCTION public.admin_engine_progress_context(p_student_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_links jsonb;v_operations jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM public.resolve_accessible_student_id(p_student_id);
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.created_at,l.id),'[]'::jsonb) INTO v_links FROM student_progress_links l WHERE student_id=p_student_id AND source='tournament_engine';
 SELECT coalesce(jsonb_agg(public.engine_operation_public(o) ORDER BY o.requested_at DESC,o.id),'[]'::jsonb) INTO v_operations FROM student_progress_link_operations o WHERE student_id=p_student_id;
 RETURN jsonb_build_object('student_id',p_student_id,'links',v_links,'operations',v_operations);
END $$;
CREATE FUNCTION public.admin_request_engine_link(p_action text,p_request_id uuid,p_student_id uuid,p_external_id text,p_evidence text,p_expected_link_id uuid,p_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old student_progress_links;v_link student_progress_links;v_op student_progress_link_operations;v_intent jsonb;v_external text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('confirm','revoke') OR p_request_id IS NULL OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 v_intent:=jsonb_build_object('action',p_action,'student_id',p_student_id,'external_id',p_external_id,'evidence',btrim(p_evidence),'expected_link_id',p_expected_link_id,'expected_revision',p_expected_revision);
 PERFORM 1 FROM students WHERE id=p_student_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_student' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_op FROM student_progress_link_operations WHERE id=p_request_id;
 IF FOUND THEN
  IF v_op.intent<>v_intent THEN RAISE EXCEPTION 'request_conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_link FROM student_progress_links WHERE id=v_op.link_id;
  RETURN jsonb_build_object('link',to_jsonb(v_link),'operation',public.engine_operation_public(v_op));
 END IF;
 IF p_action='confirm' THEN
  IF p_external_id IS NULL OR p_external_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$' THEN RAISE EXCEPTION 'invalid_identity' USING ERRCODE='22023'; END IF;
  v_external:=p_external_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('tournament_engine:'||v_external,0));
  SELECT * INTO v_old FROM student_progress_links WHERE student_id=p_student_id AND source='tournament_engine' AND external_id=v_external FOR UPDATE;
 ELSE
  SELECT * INTO v_old FROM student_progress_links WHERE id=p_expected_link_id AND student_id=p_student_id AND source='tournament_engine' FOR UPDATE;
  IF v_old.id IS NULL OR v_old.status='revoked' THEN RAISE EXCEPTION 'link_conflict' USING ERRCODE='40001'; END IF;
  v_external:=v_old.external_id;
 END IF;
 IF v_old.id IS DISTINCT FROM p_expected_link_id OR v_old.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'link_conflict' USING ERRCODE='40001'; END IF;
 IF v_old.id IS NULL THEN
  INSERT INTO student_progress_links(student_id,source,external_id,status,evidence_reference) VALUES(p_student_id,'tournament_engine',v_external,'pending',btrim(p_evidence)) RETURNING * INTO v_link;
 ELSE
  UPDATE student_progress_links SET status=CASE WHEN p_action='confirm' THEN 'pending' ELSE 'revoked' END,revision=revision+1,evidence_reference=btrim(p_evidence),updated_at=now() WHERE id=v_old.id RETURNING * INTO v_link;
 END IF;
 UPDATE student_progress_link_operations SET state='superseded',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE link_id=v_link.id AND state='pending';
 INSERT INTO student_progress_link_operations(id,link_id,student_id,external_id,action,generation,intent,evidence,requested_by)
 VALUES(p_request_id,v_link.id,p_student_id,v_external,p_action,v_link.revision,v_intent,btrim(p_evidence),auth.uid()) RETURNING * INTO v_op;
 INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_link.id,auth.uid(),CASE WHEN p_action='confirm' THEN 'request' ELSE 'revoke' END,CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_link));
 RETURN jsonb_build_object('link',to_jsonb(v_link),'operation',public.engine_operation_public(v_op));
END $$;
CREATE FUNCTION public.admin_claim_engine_operation(p_student_id uuid,p_operation_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_op student_progress_link_operations;v_link student_progress_links;v_lease jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM students WHERE id=p_student_id FOR UPDATE;
 SELECT * INTO v_op FROM student_progress_link_operations WHERE id=p_operation_id AND student_id=p_student_id FOR UPDATE;
 IF v_op.id IS NULL THEN RAISE EXCEPTION 'invalid_operation' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_link FROM student_progress_links WHERE id=v_op.link_id;
 IF v_op.state='pending' AND (v_op.lease_until IS NULL OR v_op.lease_until<now()) THEN
  UPDATE student_progress_link_operations SET lease_token=gen_random_uuid(),lease_owner=auth.uid(),lease_until=now()+interval '45 seconds',attempts=attempts+1,updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  v_lease:=jsonb_build_object('token',v_op.lease_token,'actor_id',auth.uid());
 END IF;
 RETURN jsonb_build_object('link',to_jsonb(v_link),'operation',public.engine_operation_public(v_op),'lease',v_lease,'evidence',v_op.evidence);
END $$;
CREATE FUNCTION public.admin_fail_engine_operation(p_student_id uuid,p_operation_id uuid,p_lease_token uuid,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_error NOT IN ('remote_unavailable','identity_conflict','invalid_source') THEN RAISE EXCEPTION 'invalid_error' USING ERRCODE='22023'; END IF;
 UPDATE student_progress_link_operations SET last_error_code=p_error,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_operation_id AND student_id=p_student_id AND state='pending' AND lease_token=p_lease_token AND lease_owner=auth.uid();
END $$;
-- ONLY trusted PWA server attests remote status. No browser/actor role may finalize.
CREATE FUNCTION public.server_finalize_engine_operation(p_operation_id uuid,p_lease_token uuid,p_actor_id uuid,p_proof jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_op student_progress_link_operations;v_link student_progress_links;v_old student_progress_links;
BEGIN
 IF NOT EXISTS(SELECT FROM profiles WHERE id=p_actor_id AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM student_progress_link_operations WHERE id=p_operation_id;
 IF v_op.id IS NULL THEN RAISE EXCEPTION 'invalid_operation' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM students WHERE id=v_op.student_id FOR UPDATE;
 SELECT * INTO v_op FROM student_progress_link_operations WHERE id=p_operation_id FOR UPDATE;
 SELECT * INTO v_old FROM student_progress_links WHERE id=v_op.link_id FOR UPDATE;
 IF v_op.state<>'pending' OR v_op.lease_token IS DISTINCT FROM p_lease_token OR v_op.lease_owner IS DISTINCT FROM p_actor_id OR v_op.lease_until IS NULL OR v_op.lease_until<now() OR v_op.generation<>v_old.revision THEN RAISE EXCEPTION 'operation_conflict' USING ERRCODE='40001'; END IF;
 IF p_proof->>'contract_version' IS DISTINCT FROM 'te-academy-identity-v1' OR p_proof->>'namespace' IS DISTINCT FROM 'academy_reservas_student'
 OR p_proof->>'competitor_id' IS DISTINCT FROM v_op.external_id OR p_proof->>'external_id' IS DISTINCT FROM v_op.student_id::text
 OR p_proof->>'generation' IS DISTINCT FROM v_op.generation::text OR p_proof->'request'->>'request_id' IS DISTINCT FROM v_op.id::text
 OR p_proof->'request'->>'action' IS DISTINCT FROM v_op.action OR p_proof->'request'->>'generation' IS DISTINCT FROM v_op.generation::text
 OR p_proof->'request'->>'status' IS DISTINCT FROM 'applied'
 OR (v_op.action='confirm' AND p_proof->>'link_status' IS DISTINCT FROM 'confirmed')
 OR (v_op.action='revoke' AND coalesce(p_proof->>'link_status','') NOT IN ('revoked','absent')) THEN RAISE EXCEPTION 'invalid_proof' USING ERRCODE='22023'; END IF;
 IF v_op.action='confirm' THEN
  IF v_old.status<>'pending' THEN RAISE EXCEPTION 'operation_conflict' USING ERRCODE='40001'; END IF;
  UPDATE student_progress_links SET status='confirmed',confirmed_by=p_actor_id,confirmed_at=now(),updated_at=now() WHERE id=v_old.id RETURNING * INTO v_link;
  INSERT INTO student_progress_link_audit(link_id,actor_id,action,before_data,after_data) VALUES(v_link.id,p_actor_id,'confirm',to_jsonb(v_old),to_jsonb(v_link));
 ELSE
  IF v_old.status<>'revoked' THEN RAISE EXCEPTION 'operation_conflict' USING ERRCODE='40001'; END IF;
  v_link:=v_old;
 END IF;
 UPDATE student_progress_link_operations SET state='completed',last_error_code=NULL,lease_token=NULL,lease_until=NULL,remote_checked_at=now(),updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
 RETURN jsonb_build_object('link',to_jsonb(v_link),'operation',public.engine_operation_public(v_op));
END $$;
REVOKE ALL ON FUNCTION public.engine_progress_context(uuid),public.admin_engine_progress_context(uuid),public.admin_request_engine_link(text,uuid,uuid,text,text,uuid,integer),public.admin_claim_engine_operation(uuid,uuid),public.admin_fail_engine_operation(uuid,uuid,uuid,text),public.server_finalize_engine_operation(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.engine_progress_context(uuid),public.admin_engine_progress_context(uuid),public.admin_request_engine_link(text,uuid,uuid,text,text,uuid,integer),public.admin_claim_engine_operation(uuid,uuid),public.admin_fail_engine_operation(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_finalize_engine_operation(uuid,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.admin_verify_engine_operation(p_student_id uuid,p_operation_id uuid,p_lease_token uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() OR NOT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM student_progress_link_operations o JOIN student_progress_links l ON l.id=o.link_id WHERE o.id=p_operation_id AND o.student_id=p_student_id AND o.state='pending' AND o.lease_token=p_lease_token AND o.lease_owner=auth.uid() AND o.lease_until>=now() AND o.generation=l.revision AND ((o.action='confirm' AND l.status='pending') OR (o.action='revoke' AND l.status='revoked'))) THEN RAISE EXCEPTION 'operation_conflict' USING ERRCODE='40001'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_verify_engine_operation(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_engine_operation(uuid,uuid,uuid) TO authenticated;
