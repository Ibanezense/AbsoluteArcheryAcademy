-- Attribute confirmed membership income to its original sale. Never rewrite paid_at.
-- Previous collection-based RPCs stay available for compatibility and cash reporting.
CREATE OR REPLACE FUNCTION public.get_finances_sales_report(p_start_date date,p_end_date date)
RETURNS TABLE(payment_id uuid,sale_at timestamptz,paid_at timestamptz,student_name text,
  plan_name text,base_price numeric,amount_paid numeric,discount_calculated numeric,
  payment_method text,payment_status text,movement_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_from timestamptz:=p_start_date::timestamp AT TIME ZONE 'America/Lima';
  v_until timestamptz:=p_end_date::timestamp AT TIME ZONE 'America/Lima';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE='42501'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<=p_start_date THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
  RETURN QUERY
  SELECT p.id,COALESCE(purchase.purchased_at,p.created_at,sm.created_at),p.paid_at,
    s.full_name,sm.custom_name,COALESCE(plan.base_price,0),p.amount,COALESCE(plan.base_price,0)-p.amount,
    p.payment_method,p.payment_status,'membership'::text
  FROM public.student_membership_payments p
  JOIN public.students s ON s.id=p.student_id
  JOIN public.student_memberships sm ON sm.id=p.student_membership_id
  LEFT JOIN public.membership_purchases purchase ON purchase.id=sm.purchase_id
  LEFT JOIN public.membership_plans plan ON plan.id=sm.membership_plan_id
  WHERE COALESCE(p.source,'')<>'migration'
    AND COALESCE(purchase.purchased_at,p.created_at,sm.created_at)>=v_from
    AND COALESCE(purchase.purchased_at,p.created_at,sm.created_at)<v_until
  UNION ALL
  -- Intro reporting keeps its existing confirmed-payment scope and date basis.
  SELECT ip.id,ip.paid_at,ip.paid_at,ic.full_name,'Clase de Prueba'::text,ip.amount,ip.amount,
    0::numeric,ip.payment_method,ip.payment_status,'intro'::text
  FROM public.intro_payments ip JOIN public.intro_clients ic ON ic.id=ip.intro_client_id
  WHERE ip.payment_status='paid' AND ip.paid_at>=v_from AND ip.paid_at<v_until;
END $$;

CREATE OR REPLACE FUNCTION public.get_finances_sales_dashboard(p_month_start date,p_month_end date,p_reference_date date DEFAULT (now() AT TIME ZONE 'America/Lima')::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_base jsonb; v_paid numeric; v_pending numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE='42501'; END IF;
  -- Reuse the existing complete debtor/overdue/alert calculation.
  v_base:=public.get_finances_actionable_dashboard(p_month_start,p_month_end,p_reference_date);
  SELECT COALESCE(sum(r.amount_paid) FILTER(WHERE r.payment_status='paid'),0),
    COALESCE(sum(r.amount_paid) FILTER(WHERE r.payment_status IN('pending','late')),0)
  INTO v_paid,v_pending FROM public.get_finances_sales_report(p_month_start,p_month_end) r;
  RETURN v_base || jsonb_build_object('paid_month',round(v_paid,2),'pending_month',round(v_pending,2),
    'projection_month',round(v_paid+v_pending,2));
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_operational_sales_data()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_base jsonb;
  v_month date:=date_trunc('month',now() AT TIME ZONE 'America/Lima')::date;
  v_revenue numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE='42501'; END IF;
  v_base:=public.get_admin_dashboard_operational_data()::jsonb;
  SELECT COALESCE(sum(r.amount_paid),0) INTO v_revenue
  FROM public.get_finances_sales_report(v_month,(v_month+interval '1 month')::date) r
  WHERE r.payment_status='paid' AND r.movement_kind='membership';
  RETURN jsonb_set(v_base,'{monthly,revenueThisMonth}',to_jsonb(v_revenue))::json;
END $$;
REVOKE ALL ON FUNCTION public.get_finances_sales_report(date,date),public.get_finances_sales_dashboard(date,date,date),public.get_admin_dashboard_operational_sales_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_finances_sales_report(date,date),public.get_finances_sales_dashboard(date,date,date),public.get_admin_dashboard_operational_sales_data() TO authenticated;
COMMENT ON FUNCTION public.get_finances_sales_report(date,date) IS 'Admin-only: membership sales dated by purchase, original payment creation fallback; collection date retained separately. Intro uses confirmed collection date.';
