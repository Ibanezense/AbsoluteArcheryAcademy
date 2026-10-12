-- The student's usual site is explicit and does not restrict booking eligibility.
alter table public.students add column if not exists home_location_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.students'::regclass and conname = 'students_home_location_id_fkey') then
    alter table public.students add constraint students_home_location_id_fkey
      foreign key (home_location_id) references public.academy_locations(id) on delete restrict;
  end if;
end $$;
create index if not exists students_home_location_id_idx on public.students(home_location_id);
comment on column public.students.home_location_id is 'Explicit usual academy site; NULL means not assigned. Does not limit bookings at other sites.';
notify pgrst, 'reload schema';
