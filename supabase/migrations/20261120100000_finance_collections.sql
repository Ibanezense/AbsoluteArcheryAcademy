BEGIN;
CREATE TABLE IF NOT EXISTS public.finance_collection_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL,
 payment_kind text NOT NULL CHECK (payment_kind IN ('membership','intro')),
 kind text NOT NULL CHECK (kind IN ('adjustment','refund')),
 amount numeric(12,2) NOT NULL CHECK (amount <> 0),
 payment_method text NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason)) > 0),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL UNIQUE
);
ALTER TABLE public.finance_collection_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_collection_adjustments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_finance_collections(p_from date,p_until date)
RETURNS TABLE(payment_id uuid,payment_kind text,student_name text,concept text,paid_at timestamptz,
 payment_method text,amount numeric,adjustment_id uuid,kind text,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
 IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
 RETURN QUERY WITH original AS (
   SELECT p.id, 'membership'::text AS payment_kind, s.full_name, m.custom_name AS concept,
     p.paid_at, p.payment_method, p.amount
   FROM public.student_membership_payments p JOIN public.students s ON s.id=p.student_id
   JOIN public.student_memberships m ON m.id=p.student_membership_id
   WHERE p.payment_status='paid' AND coalesce(p.source,'')<>'migration'
   UNION ALL
   SELECT p.id,'intro'::text,c.full_name,'Clase de prueba'::text,p.paid_at,p.payment_method,p.amount
   FROM public.intro_payments p JOIN public.intro_clients c ON c.id=p.intro_client_id
   WHERE p.payment_status='paid'
 ), movements AS (
   SELECT o.id, o.payment_kind, o.full_name, o.concept, o.paid_at, o.payment_method, o.amount,
     NULL::uuid AS adjustment_id, 'collection'::text AS kind, NULL::text AS reason FROM original o
   UNION ALL
   SELECT o.id,o.payment_kind,o.full_name,o.concept,a.occurred_at,a.payment_method,a.amount,a.id,a.kind,a.reason
   FROM original o JOIN public.finance_collection_adjustments a ON a.payment_id=o.id AND a.payment_kind=o.payment_kind
 )
 SELECT * FROM movements m WHERE m.paid_at >= (p_from::timestamp AT TIME ZONE 'America/Lima')
   AND m.paid_at < (p_until::timestamp AT TIME ZONE 'America/Lima')
 ORDER BY m.paid_at DESC, m.id, m.adjustment_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_finance_adjust_collection(
 p_payment_id uuid,p_payment_kind text,p_kind text,p_amount numeric,p_method text,p_reason text,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_amount numeric; v_method text; v_total numeric; v_existing uuid; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
 IF p_request_id IS NULL OR p_payment_id IS NULL OR p_payment_kind IS NULL OR p_payment_kind NOT IN ('membership','intro') OR p_kind IS NULL OR p_kind NOT IN ('adjustment','refund')
   OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Datos incompletos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_payment_kind || ':' || p_payment_id::text,0));
 SELECT id INTO v_existing FROM public.finance_collection_adjustments WHERE request_id=p_request_id;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 IF p_payment_kind='membership' THEN
   SELECT amount,payment_method INTO v_amount,v_method FROM public.student_membership_payments
   WHERE id=p_payment_id AND payment_status='paid' AND coalesce(source,'')<>'migration' FOR UPDATE;
 ELSE
   SELECT amount,payment_method INTO v_amount,v_method FROM public.intro_payments
   WHERE id=p_payment_id AND payment_status='paid' FOR UPDATE;
 END IF;
 IF v_amount IS NULL THEN RAISE EXCEPTION 'Cobro no disponible'; END IF;
 IF EXISTS (SELECT 1 FROM public.finance_collection_adjustments WHERE payment_id=p_payment_id AND payment_kind=p_payment_kind AND kind='refund') THEN
   RAISE EXCEPTION 'Este cobro ya fue devuelto';
 END IF;
 SELECT v_amount+coalesce(sum(amount),0) INTO v_total FROM public.finance_collection_adjustments
 WHERE payment_id=p_payment_id AND payment_kind=p_payment_kind;
 IF p_kind='refund' THEN
   IF v_total<=0 OR p_method IS NULL OR p_method NOT IN ('cash','yape','plin','transfer','card') THEN RAISE EXCEPTION 'Revisa el importe y el medio de devolución'; END IF;
   p_amount := -v_total; v_method := p_method;
 ELSE
   IF p_amount IS NULL OR p_amount=0 OR p_amount<>round(p_amount,2) OR v_total+p_amount<0 THEN RAISE EXCEPTION 'Ajuste inválido'; END IF;
 END IF;
 INSERT INTO public.finance_collection_adjustments(payment_id,payment_kind,kind,amount,payment_method,reason,actor_id,request_id)
 VALUES(p_payment_id,p_payment_kind,p_kind,p_amount,v_method,btrim(p_reason),auth.uid(),p_request_id) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_finance_collections(date,date),public.admin_finance_adjust_collection(uuid,text,text,numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_collections(date,date),public.admin_finance_adjust_collection(uuid,text,text,numeric,text,text,uuid) TO authenticated;
COMMIT;
