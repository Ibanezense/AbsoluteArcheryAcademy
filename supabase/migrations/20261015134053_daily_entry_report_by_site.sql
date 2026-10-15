-- Explicit site selection is mandatory for the new report interface.
-- Keep the old date-only overload compatible during rollout.
create or replace function public.get_daily_club_entry_report(p_date date, p_location_id uuid)
returns table(name text, dni text, type text)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.is_active, true)) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Selecciona una fecha.' using errcode = '22023';
  end if;
  if p_location_id is null or not exists (select 1 from public.academy_locations l where l.id = p_location_id) then
    raise exception 'Selecciona una sede válida.' using errcode = '22023';
  end if;
  return query
  with day_sessions as (
    select s.id from public.sessions s
    where (s.start_at at time zone 'America/Lima')::date = p_date
      and s.location_id = p_location_id
  ), regular_rows as (
    select coalesce(nullif(trim(st.full_name), ''), 'Desconocido')::text as name,
      coalesce(nullif(trim(st.dni), ''), 'N/A')::text as dni, 'student'::text as type
    from public.bookings b join day_sessions ds on ds.id = b.session_id
    join public.students st on st.id = b.student_id
    where b.status in ('reserved', 'attended') and b.intro_client_id is null
  ), intro_rows as (
    select coalesce(nullif(trim(ic.full_name), ''), 'Prueba')::text as name,
      'N/A'::text as dni, 'intro'::text as type
    from public.bookings b join day_sessions ds on ds.id = b.session_id
    join public.intro_clients ic on ic.id = b.intro_client_id
    where b.status in ('reserved', 'attended') and b.intro_client_id is not null
  )
  select distinct combined.name, combined.dni, combined.type
  from (select * from regular_rows union all select * from intro_rows) combined
  order by combined.type, combined.name;
end;
$$;
revoke all on function public.get_daily_club_entry_report(date,uuid) from public,anon;
grant execute on function public.get_daily_club_entry_report(date,uuid) to authenticated;
comment on function public.get_daily_club_entry_report(date,uuid) is 'Daily entry list scoped to the actual booking session site. Date and site are mandatory.';
notify pgrst, 'reload schema';
