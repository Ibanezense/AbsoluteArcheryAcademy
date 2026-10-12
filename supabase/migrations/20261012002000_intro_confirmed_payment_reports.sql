BEGIN;

-- The availability helpers lock session rows. PostgREST must allow these locks.
ALTER FUNCTION public.admin_get_intro_calendar(date,date,uuid) VOLATILE;

CREATE OR REPLACE FUNCTION public.get_finances_actionable_dashboard(p_month_start date, p_month_end date, p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(auth.role(), '');
  v_paid_month numeric := 0;
  v_pending_month numeric := 0;
  v_projection_month numeric := 0;
  v_overdue_amount numeric := 0;
  v_overdue_count integer := 0;
  v_top_debtors jsonb := '[]'::jsonb;
  v_overdue_rows jsonb := '[]'::jsonb;
  v_alerts_pending integer := 0;
BEGIN
  IF p_month_end <= p_month_start THEN
    RAISE EXCEPTION 'Rango de fechas invalido';
  END IF;

  IF v_role <> 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(SUM(entry.amount), 0)
  INTO v_paid_month
  FROM (
    SELECT p.amount
    FROM public.student_membership_payments p
    WHERE p.payment_status = 'paid'
      AND p.paid_at >= p_month_start
      AND p.paid_at < p_month_end
      AND COALESCE(p.source, '') <> 'migration'

    UNION ALL

    SELECT ip.amount
    FROM public.intro_payments ip
    WHERE ip.payment_status = 'paid'
      AND ip.paid_at >= p_month_start
      AND ip.paid_at < p_month_end
  ) entry;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_pending_month
  FROM public.student_membership_payments p
  WHERE p.payment_status IN ('pending', 'late')
    AND p.due_date IS NOT NULL
    AND p.due_date >= p_month_start
    AND p.due_date < p_month_end;

  v_projection_month := COALESCE(v_paid_month, 0) + COALESCE(v_pending_month, 0);

  SELECT
    COALESCE(SUM(p.amount), 0),
    COUNT(*)
  INTO v_overdue_amount, v_overdue_count
  FROM public.student_membership_payments p
  WHERE p.payment_status IN ('pending', 'late')
    AND p.due_date IS NOT NULL
    AND p.due_date < p_reference_date;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_top_debtors
  FROM (
    SELECT
      p.student_id,
      s.full_name AS student_name,
      COUNT(*)::integer AS overdue_count,
      ROUND(SUM(p.amount)::numeric, 2) AS overdue_amount,
      MIN(p.due_date) AS oldest_due_date
    FROM public.student_membership_payments p
    INNER JOIN public.students s ON s.id = p.student_id
    WHERE p.payment_status IN ('pending', 'late')
      AND p.due_date IS NOT NULL
      AND p.due_date < p_reference_date
    GROUP BY p.student_id, s.full_name
    ORDER BY overdue_amount DESC, overdue_count DESC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_overdue_rows
  FROM (
    SELECT
      p.id AS payment_id,
      p.student_id,
      s.full_name AS student_name,
      sm.custom_name AS membership_name,
      p.amount,
      p.currency,
      p.payment_status,
      p.due_date,
      GREATEST((p_reference_date - p.due_date), 0)::integer AS days_late
    FROM public.student_membership_payments p
    INNER JOIN public.students s ON s.id = p.student_id
    INNER JOIN public.student_memberships sm ON sm.id = p.student_membership_id
    WHERE p.payment_status IN ('pending', 'late')
      AND p.due_date IS NOT NULL
      AND p.due_date < p_reference_date
    ORDER BY p.due_date ASC
    LIMIT 30
  ) t;

  SELECT COUNT(*)
  INTO v_alerts_pending
  FROM public.admin_alert_queue q
  WHERE q.status = 'pending';

  RETURN jsonb_build_object(
    'month_start', p_month_start,
    'month_end', p_month_end,
    'reference_date', p_reference_date,
    'paid_month', ROUND(COALESCE(v_paid_month, 0)::numeric, 2),
    'pending_month', ROUND(COALESCE(v_pending_month, 0)::numeric, 2),
    'projection_month', ROUND(COALESCE(v_projection_month, 0)::numeric, 2),
    'overdue_amount', ROUND(COALESCE(v_overdue_amount, 0)::numeric, 2),
    'overdue_count', COALESCE(v_overdue_count, 0),
    'pending_alerts', COALESCE(v_alerts_pending, 0),
    'top_debtors', v_top_debtors,
    'overdue_rows', v_overdue_rows
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_finances_report(p_start_date date, p_end_date date)
 RETURNS TABLE(payment_id uuid, paid_at timestamp with time zone, student_name text, plan_name text, base_price numeric, amount_paid numeric, discount_calculated numeric, payment_method text, payment_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Verificar que sea admin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'No autorizado';
  end if;

  return query
  -- 1. Ingresos por Membresias Regulares
  select
    p.id,
    p.paid_at,
    s.full_name,
    sm.custom_name,
    coalesce(mp.base_price, 0),
    p.amount,
    coalesce(mp.base_price, 0) - p.amount,
    p.payment_method,
    p.payment_status
  from student_membership_payments p
  join students s on p.student_id = s.id
  join student_memberships sm on p.student_membership_id = sm.id
  left join membership_plans mp on sm.membership_plan_id = mp.id
  where 
    p.paid_at >= p_start_date 
    and p.paid_at < p_end_date
    and p.source != 'migration'

  UNION ALL

  -- 2. Ingresos por Clases de Prueba / Introduccion
  select
    ip.id as payment_id,
    ip.paid_at,
    ic.full_name as student_name,
    'Clase de Prueba' as plan_name,
    ip.amount as base_price,
    ip.amount as amount_paid,
    0 as discount_calculated,
    ip.payment_method,
    'paid' as payment_status
  from intro_payments ip
  join intro_clients ic on ip.intro_client_id = ic.id
  where
    ip.payment_status = 'paid'
    and ip.paid_at >= p_start_date
    and ip.paid_at < p_end_date

  order by paid_at desc;
  
end;
$function$
;
COMMIT;

