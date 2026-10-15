begin;
do $$
declare actor uuid; site_t uuid; site_u uuid; slot_t uuid; slot_u uuid;
  student_t uuid; student_u uuid; trial_t uuid; trial_u uuid; ignored_trial uuid;
  report_day date := '2040-04-20';
begin
  select id into strict actor from public.profiles where role='admin' and is_active limit 1;
  select id into strict site_t from public.academy_locations where code='tiabaya';
  select id into strict site_u from public.academy_locations where code='umacollo';
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.get_daily_club_entry_report(report_day,site_t);
    raise exception 'Unauthenticated report access was allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', actor::text,true);
  begin
    perform public.get_daily_club_entry_report(report_day,null::uuid);
    raise exception 'Missing site was allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.get_daily_club_entry_report(report_day,'00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'Unknown site was allowed';
  exception when invalid_parameter_value then null; end;
  insert into public.sessions(start_at,end_at,location_id,capacity,physical_capacity,regular_capacity,capacity_policy,notes)
    values('2040-04-20T22:00:00Z','2040-04-20T23:00:00Z',site_t,40,40,40,'fixed_operational','QA site report rollback') returning id into slot_t;
  insert into public.sessions(start_at,end_at,location_id,capacity,physical_capacity,regular_capacity,capacity_policy,notes)
    values('2040-04-20T22:00:00Z','2040-04-20T23:00:00Z',site_u,4,4,4,'fixed_operational','QA site report rollback') returning id into slot_u;
  -- Usual site is deliberately the opposite of the booked session site.
  insert into public.students(full_name,home_location_id,has_own_bow) values('QA Report Student Tiabaya',site_u,true) returning id into student_t;
  insert into public.students(full_name,home_location_id,has_own_bow) values('QA Report Student Umacollo',site_t,true) returning id into student_u;
  insert into public.intro_clients(full_name) values('QA Report Trial Tiabaya') returning id into trial_t;
  insert into public.intro_clients(full_name) values('QA Report Trial Umacollo') returning id into trial_u;
  insert into public.intro_clients(full_name) values('QA Report Cancelled') returning id into ignored_trial;
  insert into public.bookings(user_id,student_id,session_id,status,bow_usage_type) values(actor,student_t,slot_t,'reserved','own'),(actor,student_u,slot_u,'reserved','own');
  insert into public.bookings(intro_client_id,session_id,status,bow_usage_type) values(trial_t,slot_t,'reserved','own'),(trial_u,slot_u,'attended','own'),(ignored_trial,slot_t,'cancelled','own');
  if (select count(*) from public.get_daily_club_entry_report(report_day,site_t)) <> 2 then raise exception 'Tiabaya report count incorrect'; end if;
  if (select count(*) from public.get_daily_club_entry_report(report_day,site_u)) <> 2 then raise exception 'Umacollo report count incorrect'; end if;
  if exists(select 1 from public.get_daily_club_entry_report(report_day,site_t) r where r.name not like '%Tiabaya') then raise exception 'Sites mixed in Tiabaya'; end if;
  if exists(select 1 from public.get_daily_club_entry_report(report_day,site_u) r where r.name not like '%Umacollo') then raise exception 'Sites mixed in Umacollo'; end if;
  if exists(select 1 from public.get_daily_club_entry_report(report_day+1,site_t)) then raise exception 'Dates mixed'; end if;
  if has_function_privilege('anon','public.get_daily_club_entry_report(date,uuid)','EXECUTE') then raise exception 'Anon has execute grant'; end if;
end $$;
rollback;
