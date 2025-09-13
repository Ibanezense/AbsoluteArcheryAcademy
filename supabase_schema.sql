-- Habilitar extensiones útiles
create extension if not exists pgcrypto;

-- PROFILES (vinculado a auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text check (role in ('student','coach','admin')) default 'student',
  membership_type text,
  classes_remaining integer default 0,
  membership_start date,
  membership_end date,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Al crear usuario en auth, crea su profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- POLICIES sobre profiles
create policy "Users can view their own profile"
  on profiles for select
  using ( id = auth.uid() or exists (select 1 from profiles p2 where p2.id = auth.uid() and p2.role in ('coach','admin')) );

create policy "Users update only their own profile"
  on profiles for update
  using ( id = auth.uid() );

-- SESSIONS (clases)
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at timestamptz not null,
  coach_id uuid references profiles(id),
  distance integer,
  capacity integer not null default 8,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  notes text,
  created_at timestamptz default now()
);
alter table sessions enable row level security;

-- POLICIES sessions
create policy "Anyone authenticated can read sessions"
  on sessions for select using (true);

create policy "Only coaches/admins can insert sessions"
  on sessions for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('coach','admin')));

create policy "Only coaches/admins can update sessions"
  on sessions for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('coach','admin')));

-- BOOKINGS
create type booking_status as enum ('reserved','cancelled','attended','no_show');

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  status booking_status not null default 'reserved',
  created_at timestamptz default now()
);
alter table bookings enable row level security;

-- POLICIES bookings
create policy "User can see own bookings"
  on bookings for select
  using ( user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('coach','admin')) );

create policy "User can create booking for self"
  on bookings for insert to authenticated
  with check ( user_id = auth.uid() );

create policy "User can cancel own booking"
  on bookings for update to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- VIEW: sessions with available spots
create or replace view sessions_with_availability as
select
  s.*,
  (s.capacity - coalesce((select count(*) from bookings b where b.session_id = s.id and b.status = 'reserved'),0))::int as spots_left,
  (select full_name from profiles p where p.id = s.coach_id) as instructor_name
from sessions s;

-- Upcoming bookings for current user
create or replace view upcoming_bookings as
select
  b.id,
  s.start_at,
  s.end_at,
  s.distance,
  (select full_name from profiles p where p.id = s.coach_id) as instructor_name
from bookings b
join sessions s on s.id = b.session_id
where b.user_id = auth.uid() and b.status = 'reserved' and s.start_at >= now()
order by s.start_at asc;

-- Booking detail view
create or replace view booking_detail as
select
  b.id,
  b.status,
  s.start_at,
  s.end_at,
  (select full_name from profiles p where p.id = s.coach_id) as instructor_name
from bookings b
join sessions s on s.id = b.session_id;

-- User booking history for current authenticated user (past and future)
create or replace view user_booking_history as
select
  b.id as booking_id,
  b.status,
  null::text as group_type,
  s.distance as distance_m,
  s.start_at,
  s.end_at
from bookings b
join sessions s on s.id = b.session_id
where b.user_id = auth.uid()
order by s.start_at desc;

-- RPC: book_session (con chequeos atómicos)
create or replace function book_session(p_session uuid)
returns bookings
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_profile profiles;
  v_session sessions;
  v_reserved int;
  v_booking bookings;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from profiles where id = v_user;
  if v_profile is null then
    raise exception 'Perfil no encontrado';
  end if;

  if coalesce(v_profile.classes_remaining,0) <= 0 then
    raise exception 'No tienes clases disponibles';
  end if;

  select * into v_session from sessions where id = p_session for update;
  if v_session is null then
    raise exception 'Sesión no encontrada';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'La sesión no está disponible';
  end if;

  if v_session.start_at <= now() then
    raise exception 'No puedes reservar una clase pasada';
  end if;

  select count(*) into v_reserved from bookings where session_id = p_session and status = 'reserved';
  if v_reserved >= v_session.capacity then
    raise exception 'No hay cupos disponibles';
  end if;

  -- Evitar doble reserva del mismo usuario en la misma sesión
  if exists (select 1 from bookings where session_id = p_session and user_id = v_user and status = 'reserved') then
    raise exception 'Ya reservaste esta sesión';
  end if;

  insert into bookings(user_id, session_id, status) values (v_user, p_session, 'reserved') returning * into v_booking;
  update profiles set classes_remaining = classes_remaining - 1 where id = v_user;

  return v_booking;
end;
$$;

grant execute on function book_session(uuid) to authenticated;

-- RPC: cancel_booking (si cancela con 12h de anticipación, devuelve crédito)
create or replace function cancel_booking(p_booking uuid)
returns bookings
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_booking bookings;
  v_session sessions;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_booking from bookings where id = p_booking and user_id = v_user for update;
  if v_booking is null then
    raise exception 'Reserva no encontrada';
  end if;

  select * into v_session from sessions where id = v_booking.session_id;
  if v_session.start_at <= now() then
    raise exception 'La clase ya comenzó o finalizó';
  end if;

  update bookings set status = 'cancelled' where id = p_booking returning * into v_booking;

  if v_session.start_at - interval '12 hours' > now() then
    update profiles set classes_remaining = classes_remaining + 1 where id = v_user;
  end if;

  return v_booking;
end;
$$;

grant execute on function cancel_booking(uuid) to authenticated;

-- RPC: admin_mark_attendance (solo para admins)
create or replace function admin_mark_attendance(p_booking uuid, p_attended boolean)
returns bookings
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_booking bookings;
  v_before booking_status;
begin
  -- Verificar que es admin
  select exists (
    select 1 from profiles 
    where id = v_user and role = 'admin'
  ) into v_is_admin;
  
  if not v_is_admin then
    raise exception 'No autorizado';
  end if;

  -- Obtener la reserva
  select * into v_booking from bookings where id = p_booking for update;
  if v_booking is null then
    raise exception 'Reserva no encontrada';
  end if;

  -- Registrar estado previo
  v_before := v_booking.status;

  -- Marcar asistencia (cast to booking_status)
  update bookings 
  set status = case when p_attended then 'attended'::booking_status else 'no_show'::booking_status end 
  where id = p_booking
  returning * into v_booking;

  -- Insertar auditoría
  insert into attendance_audit(booking_id, admin_id, status_before, status_after)
  values (p_booking, v_user, v_before, v_booking.status);

  return v_booking;
end;
$$;

grant execute on function admin_mark_attendance(uuid, boolean) to authenticated;

-- Tabla de auditoría de asistencia
create table if not exists attendance_audit (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  admin_id uuid references profiles(id) on delete set null,
  status_before booking_status,
  status_after booking_status,
  note text,
  created_at timestamptz default now()
);

alter table attendance_audit enable row level security;

-- Policy: solo admins pueden insertar logs de auditoría
create policy "Admins can insert attendance audit"
  on attendance_audit for insert to authenticated
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Allow admins to select audit logs
create policy "Admins can view attendance audit"
  on attendance_audit for select
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
