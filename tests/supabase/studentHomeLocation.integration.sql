begin;
do $$
declare v_student uuid; v_site uuid;
begin
  select id into strict v_student from public.students order by created_at limit 1;
  select id into strict v_site from public.academy_locations where is_active order by name limit 1;
  update public.students set home_location_id = v_site where id = v_student;
  if not exists (select 1 from public.students s join public.academy_locations l on l.id = s.home_location_id where s.id = v_student and l.id = v_site) then
    raise exception 'Saved site relation is missing';
  end if;
  begin
    update public.students set home_location_id = '00000000-0000-0000-0000-000000000000' where id = v_student;
    raise exception 'Invalid site was accepted';
  exception when foreign_key_violation then null;
  end;
  update public.students set home_location_id = null where id = v_student;
  if exists (select 1 from public.students where id = v_student and home_location_id is not null) then raise exception 'Cannot clear site'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
do $$ declare v_count integer;
begin
  update public.students set home_location_id = null;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'Non-admin could modify students'; end if;
end $$;
rollback;
