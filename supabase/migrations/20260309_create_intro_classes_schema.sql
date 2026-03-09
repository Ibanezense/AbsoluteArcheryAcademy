-- 1. Crear tabla de clientes
create table if not exists public.intro_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  age integer,
  phone text,
  created_at timestamptz default now()
);
alter table public.intro_clients enable row level security;

-- Policies temporales (admin full access)
create policy intro_clients_admin_all
  on public.intro_clients
  for all using (exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 2. Crear tabla de pagos
create table if not exists public.intro_payments (
  id uuid primary key default gen_random_uuid(),
  intro_client_id uuid references public.intro_clients(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method text not null,
  paid_at timestamptz default now()
);
alter table public.intro_payments enable row level security;

create policy intro_payments_admin_all
  on public.intro_payments
  for all using (exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 3. Modificar bookings
alter table public.bookings add column if not exists intro_client_id uuid references public.intro_clients(id);

-- Opcional: Para evitar inconsistencias (pero manteniendo compatibilidad previa por si bookings ya tenía data sin constraint)
-- Si user_id estaba como NOT NULL, hay que quitarle esa restricción.
alter table public.bookings alter column user_id drop not null;

-- Agregar un CHECK que garantice que al menos UNO (user_id o intro_client_id) existe, pero no ambos.
alter table public.bookings drop constraint if exists bookings_user_or_intro_chk;
alter table public.bookings add constraint bookings_user_or_intro_chk 
  check (
    (user_id is not null and intro_client_id is null) or 
    (user_id is null and intro_client_id is not null)
  );

-- Actualizar vista user_booking_history (opcional, solo para excluir explícitamente intros, 
-- aunque por defecto el "user_id = auth.uid()" ya los filtra, si la vista usa "join profiles", las reservas de intro darán NULL join).
