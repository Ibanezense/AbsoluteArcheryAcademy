create or replace function get_finances_report(p_start_date date, p_end_date date)
returns table (
  payment_id uuid,
  paid_at timestamptz,
  student_name text,
  plan_name text,
  base_price numeric,
  amount_paid numeric,
  discount_calculated numeric,
  payment_method text,
  payment_status text
)
language plpgsql
security definer
as $$
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
    ip.paid_at >= p_start_date
    and ip.paid_at < p_end_date

  order by paid_at desc;
  
end;
$$;
