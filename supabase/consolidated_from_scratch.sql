-- ============================================================================
-- CONSOLIDATED DATABASE SCRIPT - AS ARCHERY
-- Generado: 2026-03-15
-- Proposito: Recrear la base de datos completa desde cero.
-- INSTRUCCIONES:
-- 1. Crear un nuevo proyecto en Supabase
-- 2. Copiar SUPABASE_URL y SUPABASE_ANON_KEY al .env.local
-- 3. Ejecutar este script completo en el SQL Editor de Supabase
-- 4. Crear un usuario admin manualmente en Auth
-- 5. Asignarle role=admin en la tabla profiles
-- 6. Insertar los planes de membresia en membership_plans
-- ============================================================================


-- SOURCE: supabase_schema.sql

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

-- RPC: cancel_booking (siempre devuelve crédito al cancelar)
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

  -- Siempre devolver el crédito al cancelar (sin restricción de tiempo)
  update profiles set classes_remaining = classes_remaining + 1 where id = v_user;

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



-- SOURCE: 20251008_simple_infrastructure.sql

-- Migración simplificada solo para tablas de infraestructura
-- Solo las tablas que necesitamos para la funcionalidad

-- Crear tablas de infraestructura
CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('niños', 'jovenes', 'adultos', 'universal')),
    total_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shooting_lanes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    distance_meters INTEGER NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 4,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Políticas RLS para equipment
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view equipment" ON equipment;
CREATE POLICY "Everyone can view equipment"
    ON equipment FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Only admins can manage equipment" ON equipment;
CREATE POLICY "Only admins can manage equipment"
    ON equipment FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Políticas RLS para shooting_lanes
ALTER TABLE shooting_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view shooting lanes" ON shooting_lanes;
CREATE POLICY "Everyone can view shooting lanes"
    ON shooting_lanes FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Only admins can manage shooting lanes" ON shooting_lanes;
CREATE POLICY "Only admins can manage shooting lanes"
    ON shooting_lanes FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Insertar datos de ejemplo para equipamiento
INSERT INTO equipment (name, category, total_quantity, available_quantity, description) VALUES
('Arco Infantil Recurvo', 'niños', 5, 5, 'Arcos de iniciación para niños de 6-12 años'),
('Arco Juvenil Compuesto', 'jovenes', 8, 8, 'Arcos compuestos para jóvenes de 13-17 años'),
('Arco Adulto Recurvo', 'adultos', 15, 15, 'Arcos recurvos para adultos principiantes y avanzados')
ON CONFLICT DO NOTHING;

-- Insertar datos de ejemplo para pistas
INSERT INTO shooting_lanes (name, distance_meters, max_capacity, description) VALUES
('Pista Corta', 10, 4, 'Pista para principiantes y niños'),
('Pista Mediana', 25, 4, 'Pista para nivel intermedio'),
('Pista Principal', 50, 6, 'Pista principal para competencias')
ON CONFLICT (name) DO NOTHING;


-- SOURCE: 20251030_create_session_distance_allocations.sql

-- ====================================================================
-- MIGRACIÓN: Crear tabla session_distance_allocations
-- ====================================================================
-- Esta tabla almacena la asignación de distancias (pacas/targets) 
-- para cada sesión específica
-- ====================================================================

-- Crear la tabla session_distance_allocations
CREATE TABLE IF NOT EXISTS session_distance_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  distance_m INTEGER NOT NULL CHECK (distance_m IN (10, 15, 20, 30, 40, 50, 60, 70)),
  targets INTEGER NOT NULL DEFAULT 0 CHECK (targets >= 0 AND targets <= 8), -- número de pacas asignadas (máx 8)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, distance_m) -- Una sesión no puede tener la misma distancia duplicada
);

-- Índice para optimizar búsquedas por sesión
CREATE INDEX IF NOT EXISTS idx_session_distance_allocations_session_id 
ON session_distance_allocations(session_id);

-- Habilitar RLS
ALTER TABLE session_distance_allocations ENABLE ROW LEVEL SECURITY;

-- Policy: Todos pueden ver las asignaciones de distancias
CREATE POLICY "Anyone can view session distance allocations"
  ON session_distance_allocations FOR SELECT
  USING (true);

-- Policy: Solo admins pueden gestionar asignaciones
CREATE POLICY "Only admins can manage session distance allocations"
  ON session_distance_allocations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_session_distance_allocations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS update_session_distance_allocations_timestamp ON session_distance_allocations;
CREATE TRIGGER update_session_distance_allocations_timestamp
  BEFORE UPDATE ON session_distance_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_session_distance_allocations_updated_at();

-- ====================================================================
-- COMENTARIO IMPORTANTE:
-- ====================================================================
-- Esta tabla permite que cada sesión defina qué distancias están
-- disponibles y cuántas pacas (targets) hay asignadas para cada una.
-- 
-- Por ejemplo, una sesión puede tener:
-- - 10m: 4 pacas (16 plazas = 4 pacas x 4 plazas/paca)
-- - 18m: 6 pacas (24 plazas)
-- - 30m: 8 pacas (32 plazas)
-- 
-- Las distancias permitidas son: 10, 15, 18, 20, 25, 30, 40, 50, 60, 70 metros
-- ====================================================================



-- SOURCE: 20251023_add_booking_limits_simplified.sql

-- ====================================================================
-- MIGRACIÓN SIMPLIFICADA: Validación de límites por distancia y grupo
-- ====================================================================
-- Agrega solo lo necesario para validar cupos usando las tablas existentes:
-- - sessions (con capacity_children, capacity_youth, etc.)
-- - session_distance_allocations (con targets por distancia)
-- - profiles (agregar distance_m y group_type)
-- - bookings (agregar distance_m y group_type)
-- Distancias disponibles: 10m, 15m, 20m, 30m, 40m, 50m, 60m, 70m
-- ====================================================================

-- Agregar columnas a profiles si no existen
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='distance_m') THEN
    ALTER TABLE profiles ADD COLUMN distance_m integer DEFAULT 18;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='group_type') THEN
    ALTER TABLE profiles ADD COLUMN group_type text DEFAULT 'adult'
      CHECK (group_type IN ('children', 'youth', 'adult', 'assigned', 'ownbow'));
  END IF;
END $$;

-- Agregar columnas a bookings si no existen
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='bookings' AND column_name='distance_m') THEN
    ALTER TABLE bookings ADD COLUMN distance_m integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='bookings' AND column_name='group_type') THEN
    ALTER TABLE bookings ADD COLUMN group_type text;
  END IF;
END $$;

-- ====================================================================
-- FUNCIÓN: Verificar disponibilidad de cupos
-- ====================================================================
CREATE OR REPLACE FUNCTION check_session_availability_v2(
  p_session_id uuid,
  p_distance_m integer,
  p_group_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_allocation RECORD;
  v_reserved_distance integer;
  v_reserved_group integer;
  v_capacity_distance integer;
  v_capacity_group integer;
  v_available_distance integer;
  v_available_group integer;
BEGIN
  -- Obtener la sesión con sus límites por grupo
  SELECT * INTO v_session
  FROM sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'session_not_found',
      'message', 'Sesión no encontrada'
    );
  END IF;

  -- Obtener allocation (pacas) para la distancia solicitada
  SELECT * INTO v_allocation
  FROM session_distance_allocations
  WHERE session_id = p_session_id
    AND distance_m = p_distance_m;

  IF v_allocation IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'distance_not_available',
      'message', 'La distancia ' || p_distance_m || 'm no está disponible para esta sesión'
    );
  END IF;

  -- Obtener el límite de cupos para el grupo
  v_capacity_group := CASE p_group_type
    WHEN 'children' THEN COALESCE(v_session.capacity_children, 0)
    WHEN 'youth' THEN COALESCE(v_session.capacity_youth, 0)
    WHEN 'adult' THEN COALESCE(v_session.capacity_adult, 0)
    WHEN 'assigned' THEN COALESCE(v_session.capacity_assigned, 0)
    WHEN 'ownbow' THEN COALESCE(v_session.capacity_ownbow, 0)
    ELSE 0
  END;

  -- Calcular capacidad por distancia (pacas x 4 plazas)
  v_capacity_distance := v_allocation.targets * 4;

  -- Contar reservas existentes para esta distancia
  SELECT COUNT(*) INTO v_reserved_distance
  FROM bookings
  WHERE session_id = p_session_id
    AND status = 'reserved'
    AND distance_m = p_distance_m;

  -- Contar reservas existentes para este grupo
  SELECT COUNT(*) INTO v_reserved_group
  FROM bookings
  WHERE session_id = p_session_id
    AND status = 'reserved'
    AND group_type::text = p_group_type;

  -- Calcular disponibilidad
  v_available_distance := v_capacity_distance - v_reserved_distance;
  v_available_group := v_capacity_group - v_reserved_group;

  -- Verificar límite por distancia
  IF v_available_distance <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'distance_full',
      'message', 'Turno lleno para ' || p_distance_m || 'm. Por favor selecciona otro turno.',
      'reserved', v_reserved_distance,
      'capacity', v_capacity_distance
    );
  END IF;

  -- Verificar límite por grupo
  IF v_available_group <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'group_full',
      'message', 'No hay cupos disponibles para tu grupo en esta sesión. Por favor selecciona otro turno.',
      'reserved', v_reserved_group,
      'capacity', v_capacity_group
    );
  END IF;

  -- Hay cupos disponibles
  RETURN jsonb_build_object(
    'available', true,
    'available_distance', v_available_distance,
    'available_group', v_available_group
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_session_availability_v2(uuid, integer, text) TO authenticated;

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Ejecutar este script en Supabase SQL Editor
-- 2. Luego ejecutar los scripts de actualización de book_session
-- ====================================================================



-- SOURCE: 20260227_create_v2_core_entities.sql

-- ============================================================================
-- V2 CORE ENTITIES
-- Fecha: 2026-02-27
-- Proposito:
-- 1. Separar cuenta de alumno
-- 2. Agregar soporte para tutores
-- 3. Crear membresias, pagos y ledger V2
-- 4. Mantener convivencia con el esquema actual
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PROFILES: compatibilidad para cuentas V2
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS dni char(8),
  ADD COLUMN IF NOT EXISTS access_code char(8),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET access_code = dni
WHERE access_code IS NULL
  AND dni IS NOT NULL
  AND dni ~ '^[0-9]{8}$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p2
    WHERE p2.id <> public.profiles.id
      AND p2.dni = public.profiles.dni
  );

DROP INDEX IF EXISTS idx_profiles_access_code_unique;
CREATE UNIQUE INDEX idx_profiles_access_code_unique
  ON public.profiles(access_code)
  WHERE access_code IS NOT NULL;

DROP INDEX IF EXISTS idx_profiles_dni_unique;
CREATE UNIQUE INDEX idx_profiles_dni_unique
  ON public.profiles(dni)
  WHERE dni IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'guardian', 'admin', 'coach'));

COMMENT ON COLUMN public.profiles.role IS
  'V2 roles: admin, guardian, student. coach queda deprecado temporalmente por compatibilidad.';

COMMENT ON COLUMN public.profiles.access_code IS
  'Codigo de acceso entregado por admin. En la version actual se alinea con DNI de 8 digitos.';

-- ----------------------------------------------------------------------------
-- HELPERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_active, true)
  );
$$;

-- ----------------------------------------------------------------------------
-- STUDENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  avatar_url text,
  date_of_birth date,
  dni char(8),
  phone text,
  email text,
  medical_notes text,
  current_distance_m integer,
  category text,
  level text,
  has_own_bow boolean NOT NULL DEFAULT false,
  assigned_bow boolean NOT NULL DEFAULT false,
  bow_poundage integer,
  is_active boolean NOT NULL DEFAULT true,
  self_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_dni_format_chk CHECK (dni IS NULL OR dni ~ '^[0-9]{8}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_dni_unique
  ON public.students(dni)
  WHERE dni IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_self_profile_unique
  ON public.students(self_profile_id)
  WHERE self_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_full_name
  ON public.students(full_name);

CREATE INDEX IF NOT EXISTS idx_students_is_active
  ON public.students(is_active);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT GUARDIANS
-- Regla actual: maximo un tutor por alumno
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship text,
  can_view_profile boolean NOT NULL DEFAULT true,
  can_view_memberships boolean NOT NULL DEFAULT true,
  can_book boolean NOT NULL DEFAULT true,
  can_cancel_booking boolean NOT NULL DEFAULT true,
  can_view_payments boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_guardians_student_unique UNIQUE (student_id),
  CONSTRAINT student_guardians_guardian_student_unique UNIQUE (guardian_profile_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian
  ON public.student_guardians(guardian_profile_id);

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- MEMBERSHIP PLANS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  classes_included integer NOT NULL CHECK (classes_included >= 0),
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  base_price numeric(10,2) CHECK (base_price IS NULL OR base_price >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_active
  ON public.membership_plans(is_active);

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT MEMBERSHIPS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  membership_plan_id uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  legacy_profile_membership_id uuid,
  custom_name text NOT NULL,
  classes_total integer NOT NULL CHECK (classes_total >= 0),
  classes_used integer NOT NULL DEFAULT 0 CHECK (classes_used >= 0),
  classes_remaining integer NOT NULL DEFAULT 0 CHECK (classes_remaining >= 0),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'expired', 'cancelled', 'consumed', 'historical')),
  total_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  notes text,
  sold_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_memberships_legacy_unique UNIQUE (legacy_profile_membership_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_memberships_one_active
  ON public.student_memberships(student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_student_memberships_student
  ON public.student_memberships(student_id, start_date DESC);

ALTER TABLE public.student_memberships ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT MEMBERSHIP PAYMENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_membership_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id) ON DELETE CASCADE,
  due_date date,
  paid_at timestamptz NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  payment_method text,
  payment_status text NOT NULL CHECK (payment_status IN ('pending', 'paid', 'late', 'cancelled', 'waived')),
  reward_credits integer NOT NULL DEFAULT 0 CHECK (reward_credits >= 0),
  reward_reason text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  recorded_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_membership_payments_student
  ON public.student_membership_payments(student_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_membership_payments_membership
  ON public.student_membership_payments(student_membership_id, paid_at DESC);

ALTER TABLE public.student_membership_payments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT CREDIT LEDGER
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid REFERENCES public.student_memberships(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'membership_activation',
      'membership_renewal',
      'booking_reserved',
      'booking_cancelled_refund',
      'booking_cancelled_no_refund',
      'admin_adjustment',
      'reward_credit',
      'migration_seed',
      'migration_usage'
    )
  ),
  delta integer NOT NULL,
  balance_after integer,
  reason text NOT NULL,
  performed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_credit_ledger_student
  ON public.student_credit_ledger(student_id, created_at DESC);

ALTER TABLE public.student_credit_ledger ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- ACCESS FUNCTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND (
        public.is_admin_user()
        OR s.self_profile_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.student_guardians sg
          WHERE sg.student_id = s.id
            AND sg.guardian_profile_id = auth.uid()
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS students_select_v2 ON public.students;
CREATE POLICY students_select_v2
  ON public.students
  FOR SELECT
  USING (public.can_access_student(id));

DROP POLICY IF EXISTS students_admin_write_v2 ON public.students;
CREATE POLICY students_admin_write_v2
  ON public.students
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_guardians_select_v2 ON public.student_guardians;
CREATE POLICY student_guardians_select_v2
  ON public.student_guardians
  FOR SELECT
  USING (
    public.is_admin_user()
    OR guardian_profile_id = auth.uid()
    OR public.can_access_student(student_id)
  );

DROP POLICY IF EXISTS student_guardians_admin_write_v2 ON public.student_guardians;
CREATE POLICY student_guardians_admin_write_v2
  ON public.student_guardians
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS membership_plans_read_v2 ON public.membership_plans;
CREATE POLICY membership_plans_read_v2
  ON public.membership_plans
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS membership_plans_admin_write_v2 ON public.membership_plans;
CREATE POLICY membership_plans_admin_write_v2
  ON public.membership_plans
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_memberships_select_v2 ON public.student_memberships;
CREATE POLICY student_memberships_select_v2
  ON public.student_memberships
  FOR SELECT
  USING (public.can_access_student(student_id));

DROP POLICY IF EXISTS student_memberships_admin_write_v2 ON public.student_memberships;
CREATE POLICY student_memberships_admin_write_v2
  ON public.student_memberships
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_membership_payments_select_v2 ON public.student_membership_payments;
CREATE POLICY student_membership_payments_select_v2
  ON public.student_membership_payments
  FOR SELECT
  USING (public.can_access_student(student_id));

DROP POLICY IF EXISTS student_membership_payments_admin_write_v2 ON public.student_membership_payments;
CREATE POLICY student_membership_payments_admin_write_v2
  ON public.student_membership_payments
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_credit_ledger_select_v2 ON public.student_credit_ledger;
CREATE POLICY student_credit_ledger_select_v2
  ON public.student_credit_ledger
  FOR SELECT
  USING (public.can_access_student(student_id));

DROP POLICY IF EXISTS student_credit_ledger_admin_write_v2 ON public.student_credit_ledger;
CREATE POLICY student_credit_ledger_admin_write_v2
  ON public.student_credit_ledger
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ----------------------------------------------------------------------------
-- COMMENTS
-- ----------------------------------------------------------------------------

COMMENT ON TABLE public.students IS
  'Alumno real del sistema. Separado de profiles para soportar cuentas de tutores y alumnos con acceso propio.';

COMMENT ON TABLE public.student_guardians IS
  'Relacion entre una cuenta tutor y un alumno. Regla actual: maximo un tutor por alumno.';

COMMENT ON TABLE public.student_memberships IS
  'Historial y estado actual de membresias por alumno.';

COMMENT ON TABLE public.student_membership_payments IS
  'Pagos reales de membresias con fechas y posibilidad de premios por puntualidad o constancia.';

COMMENT ON TABLE public.student_credit_ledger IS
  'Auditoria de movimientos de saldo de clases por alumno.';



-- SOURCE: 20260228_create_reservation_engine_v3.sql

-- ============================================================================
-- RESERVATION ENGINE V3
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Modelar inventario de arcos por libraje
-- 2. Modelar plantillas semanales de turnos y cupos por distancia
-- 3. Migrar la logica de reservas a distancia + inventario por libraje
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bow_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_weight_lbs integer NOT NULL UNIQUE CHECK (draw_weight_lbs > 0),
  quantity_total integer NOT NULL CHECK (quantity_total >= 0),
  quantity_active integer NOT NULL CHECK (quantity_active >= 0 AND quantity_active <= quantity_total),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bow_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bow_inventory_read_v3 ON public.bow_inventory;
CREATE POLICY bow_inventory_read_v3
  ON public.bow_inventory
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS bow_inventory_admin_write_v3 ON public.bow_inventory;
CREATE POLICY bow_inventory_admin_write_v3
  ON public.bow_inventory
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE TABLE IF NOT EXISTS public.weekly_session_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_session_templates_time_chk CHECK (end_time > start_time)
);

ALTER TABLE public.weekly_session_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_session_templates_read_v3 ON public.weekly_session_templates;
CREATE POLICY weekly_session_templates_read_v3
  ON public.weekly_session_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS weekly_session_templates_admin_write_v3 ON public.weekly_session_templates;
CREATE POLICY weekly_session_templates_admin_write_v3
  ON public.weekly_session_templates
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE TABLE IF NOT EXISTS public.weekly_session_template_distances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_template_id uuid NOT NULL REFERENCES public.weekly_session_templates(id) ON DELETE CASCADE,
  distance_m integer NOT NULL CHECK (distance_m > 0),
  slot_capacity integer NOT NULL CHECK (slot_capacity >= 0),
  targets integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_session_template_distances_unique UNIQUE (weekly_template_id, distance_m)
);

ALTER TABLE public.weekly_session_template_distances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_session_template_distances_read_v3 ON public.weekly_session_template_distances;
CREATE POLICY weekly_session_template_distances_read_v3
  ON public.weekly_session_template_distances
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS weekly_session_template_distances_admin_write_v3 ON public.weekly_session_template_distances;
CREATE POLICY weekly_session_template_distances_admin_write_v3
  ON public.weekly_session_template_distances
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS weekly_template_id uuid REFERENCES public.weekly_session_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.session_distance_allocations
  ADD COLUMN IF NOT EXISTS slot_capacity integer;

UPDATE public.session_distance_allocations
SET slot_capacity = targets * 4
WHERE slot_capacity IS NULL;

ALTER TABLE public.session_distance_allocations
  ALTER COLUMN slot_capacity SET DEFAULT 0;

ALTER TABLE public.session_distance_allocations
  DROP CONSTRAINT IF EXISTS session_distance_allocations_slot_capacity_chk;

ALTER TABLE public.session_distance_allocations
  ADD CONSTRAINT session_distance_allocations_slot_capacity_chk CHECK (slot_capacity >= 0);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS bow_poundage integer,
  ADD COLUMN IF NOT EXISTS bow_usage_type text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_bow_usage_type_chk;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_bow_usage_type_chk CHECK (
    bow_usage_type IS NULL
    OR bow_usage_type IN ('shared_inventory', 'assigned', 'own')
  );

UPDATE public.bookings b
SET
  bow_poundage = s.bow_poundage,
  bow_usage_type = CASE
    WHEN s.has_own_bow THEN 'own'
    WHEN s.assigned_bow THEN 'assigned'
    WHEN s.bow_poundage IS NOT NULL THEN 'shared_inventory'
    ELSE NULL
  END
FROM public.students s
WHERE b.student_id = s.id
  AND (b.bow_poundage IS NULL OR b.bow_usage_type IS NULL);

CREATE OR REPLACE FUNCTION public.update_bow_inventory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bow_inventory_updated_at_trigger ON public.bow_inventory;
CREATE TRIGGER bow_inventory_updated_at_trigger
  BEFORE UPDATE ON public.bow_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bow_inventory_updated_at();

CREATE OR REPLACE FUNCTION public.update_weekly_session_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_session_templates_updated_at_trigger ON public.weekly_session_templates;
CREATE TRIGGER weekly_session_templates_updated_at_trigger
  BEFORE UPDATE ON public.weekly_session_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_weekly_session_templates_updated_at();

DROP TRIGGER IF EXISTS weekly_session_template_distances_updated_at_trigger ON public.weekly_session_template_distances;
CREATE TRIGGER weekly_session_template_distances_updated_at_trigger
  BEFORE UPDATE ON public.weekly_session_template_distances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_weekly_session_templates_updated_at();

DROP FUNCTION IF EXISTS public.check_session_availability_v3(uuid, uuid);
CREATE OR REPLACE FUNCTION public.check_session_availability_v3(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_distance_capacity integer;
  v_reserved_distance integer;
  v_bow_capacity integer;
  v_reserved_bows integer;
  v_distance_remaining integer;
  v_bow_remaining integer;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'Alumno no encontrado');
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'El alumno no tiene distancia configurada');
  END IF;

  SELECT COALESCE(sda.slot_capacity, sda.targets * 4, 0)
  INTO v_distance_capacity
  FROM public.session_distance_allocations sda
  WHERE sda.session_id = p_session_id
    AND sda.distance_m = v_student.current_distance_m;

  IF COALESCE(v_distance_capacity, 0) <= 0 THEN
    RETURN jsonb_build_object('available', false, 'message', 'No hay cupos configurados para esa distancia');
  END IF;

  SELECT COUNT(*)
  INTO v_reserved_distance
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.distance_m = v_student.current_distance_m
    AND b.status = 'reserved';

  v_distance_remaining := GREATEST(v_distance_capacity - v_reserved_distance, 0);

  IF v_distance_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'No hay cupos disponibles para esta distancia',
      'distance_capacity', v_distance_capacity,
      'distance_reserved', v_reserved_distance
    );
  END IF;

  v_bow_usage_type := CASE
    WHEN v_student.has_own_bow THEN 'own'
    WHEN v_student.assigned_bow THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF v_bow_usage_type IN ('own', 'assigned') THEN
    RETURN jsonb_build_object(
      'available', true,
      'message', 'Cupo disponible',
      'bow_usage_type', v_bow_usage_type,
      'distance_capacity', v_distance_capacity,
      'distance_reserved', v_reserved_distance,
      'spots_for_student', v_distance_remaining
    );
  END IF;

  IF v_student.bow_poundage IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'El alumno no tiene libraje configurado');
  END IF;

  SELECT bi.quantity_active
  INTO v_bow_capacity
  FROM public.bow_inventory bi
  WHERE bi.draw_weight_lbs = v_student.bow_poundage;

  IF COALESCE(v_bow_capacity, 0) <= 0 THEN
    RETURN jsonb_build_object('available', false, 'message', 'No hay inventario activo para ese libraje');
  END IF;

  SELECT COUNT(*)
  INTO v_reserved_bows
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.status = 'reserved'
    AND b.bow_usage_type = 'shared_inventory'
    AND b.bow_poundage = v_student.bow_poundage;

  v_bow_remaining := GREATEST(v_bow_capacity - v_reserved_bows, 0);

  IF v_bow_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'No hay arcos disponibles para ese libraje en este turno',
      'bow_capacity', v_bow_capacity,
      'bow_reserved', v_reserved_bows
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'message', 'Cupo disponible',
    'bow_usage_type', v_bow_usage_type,
    'distance_capacity', v_distance_capacity,
    'distance_reserved', v_reserved_distance,
    'bow_capacity', v_bow_capacity,
    'bow_reserved', v_reserved_bows,
    'spots_for_student', LEAST(v_distance_remaining, v_bow_remaining)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_session_availability_v3(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_available_sessions_for_student(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_available_sessions_for_student(
  p_student_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  already_reserved boolean,
  distance_m integer,
  bow_usage_type text,
  slot_capacity integer,
  distance_reserved integer,
  bow_capacity integer,
  bow_reserved integer,
  spots_for_student integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  v_bow_usage_type := CASE
    WHEN v_student.has_own_bow THEN 'own'
    WHEN v_student.assigned_bow THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  WITH distance_caps AS (
    SELECT
      s.id AS session_id,
      s.start_at,
      s.end_at,
      s.status,
      v_student.current_distance_m AS distance_m,
      COALESCE(sda.slot_capacity, sda.targets * 4, 0) AS slot_capacity
    FROM public.sessions s
    LEFT JOIN public.session_distance_allocations sda
      ON sda.session_id = s.id
     AND sda.distance_m = v_student.current_distance_m
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') BETWEEN p_date_from AND p_date_to
  ),
  student_reservations AS (
    SELECT
      b.session_id,
      true AS already_reserved
    FROM public.bookings b
    WHERE b.student_id = v_student_id
      AND b.status = 'reserved'
  ),
  distance_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.distance_m = v_student.current_distance_m
      AND b.status = 'reserved'
    GROUP BY b.session_id
  ),
  bow_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.status = 'reserved'
      AND b.bow_usage_type = 'shared_inventory'
      AND b.bow_poundage = v_student.bow_poundage
    GROUP BY b.session_id
  )
  SELECT
    dc.session_id,
    dc.start_at,
    dc.end_at,
    dc.status::text,
    COALESCE(sr.already_reserved, false) AS already_reserved,
    dc.distance_m,
    v_bow_usage_type,
    dc.slot_capacity,
    COALESCE(dr.reserved_count, 0) AS distance_reserved,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(bi.quantity_active, 0)
      ELSE NULL
    END AS bow_capacity,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(br.reserved_count, 0)
      ELSE NULL
    END AS bow_reserved,
    CASE
      WHEN dc.status <> 'scheduled' THEN 0
      WHEN dc.start_at <= now() THEN 0
      WHEN COALESCE(sr.already_reserved, false) THEN 0
      WHEN dc.slot_capacity <= 0 THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned')
        THEN GREATEST(dc.slot_capacity - COALESCE(dr.reserved_count, 0), 0)
      ELSE GREATEST(
        LEAST(
          dc.slot_capacity - COALESCE(dr.reserved_count, 0),
          COALESCE(bi.quantity_active, 0) - COALESCE(br.reserved_count, 0)
        ),
        0
      )
    END AS spots_for_student
  FROM distance_caps dc
  LEFT JOIN student_reservations sr
    ON sr.session_id = dc.session_id
  LEFT JOIN distance_reserved dr
    ON dr.session_id = dc.session_id
  LEFT JOIN bow_reserved br
    ON br.session_id = dc.session_id
  LEFT JOIN public.bow_inventory bi
    ON bi.draw_weight_lbs = v_student.bow_poundage
  ORDER BY dc.start_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) TO authenticated;

COMMENT ON TABLE public.bow_inventory IS
  'Inventario de arcos compartidos por libraje. assigned y own no consumen este stock.';

COMMENT ON TABLE public.weekly_session_templates IS
  'Plantillas semanales de turnos recurrentes. Cada sesion real puede heredar de una plantilla y luego modificarse manualmente.';

COMMENT ON TABLE public.weekly_session_template_distances IS
  'Cupos por distancia para una plantilla semanal. Las sesiones reales heredan estos cupos y pueden sobrescribirse.';

COMMENT ON COLUMN public.session_distance_allocations.slot_capacity IS
  'Cupo directo por distancia para el turno. Si es null en datos legacy, usar targets * 4.';

COMMENT ON COLUMN public.bookings.bow_usage_type IS
  'Snapshot tecnico del tipo de uso del arco al momento de la reserva: shared_inventory, assigned u own.';

COMMENT ON FUNCTION public.check_session_availability_v3(uuid, uuid) IS
  'Evalua disponibilidad real del turno para un alumno segun cupo por distancia y stock de arcos por libraje.';

COMMENT ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) IS
  'Lista turnos y spots reales para un alumno considerando distancia, arco propio/asignado e inventario por libraje.';



-- SOURCE: 20260228_create_student_dashboard_rpcs.sql

-- ============================================================================
-- STUDENT DASHBOARD RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Exponer lecturas V2 para alumno y tutor
-- 2. Resolver el alumno accesible desde auth.uid()
-- 3. Mantener compatibilidad con widgets existentes del dashboard
-- ============================================================================

DROP FUNCTION IF EXISTS public.resolve_accessible_student_id(uuid);
CREATE OR REPLACE FUNCTION public.resolve_accessible_student_id(p_student_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_resolved_student_id uuid;
  v_guardian_student_count integer;
BEGIN
  v_auth_id := auth.uid();

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_student_id IS NOT NULL THEN
    IF public.can_access_student(p_student_id) THEN
      RETURN p_student_id;
    END IF;

    RAISE EXCEPTION 'No tienes acceso a este alumno';
  END IF;

  SELECT s.id
  INTO v_resolved_student_id
  FROM public.students s
  WHERE s.self_profile_id = v_auth_id
  LIMIT 1;

  IF v_resolved_student_id IS NOT NULL THEN
    RETURN v_resolved_student_id;
  END IF;

  SELECT COUNT(*)
  INTO v_guardian_student_count
  FROM public.student_guardians sg
  WHERE sg.guardian_profile_id = v_auth_id;

  IF v_guardian_student_count = 1 THEN
    SELECT sg.student_id
    INTO v_resolved_student_id
    FROM public.student_guardians sg
    WHERE sg.guardian_profile_id = v_auth_id
    LIMIT 1;

    RETURN v_resolved_student_id;
  END IF;

  IF v_guardian_student_count > 1 THEN
    RAISE EXCEPTION 'Debes seleccionar un alumno';
  END IF;

  RAISE EXCEPTION 'No hay alumno accesible para esta cuenta';
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_accessible_student_id(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_children();
CREATE OR REPLACE FUNCTION public.get_my_children()
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  current_distance_m integer,
  level text,
  is_active boolean,
  relationship text,
  self_profile_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.current_distance_m,
    s.level,
    s.is_active,
    'self'::text AS relationship,
    s.self_profile_id
  FROM public.students s
  WHERE s.self_profile_id = auth.uid()

  UNION ALL

  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.current_distance_m,
    s.level,
    s.is_active,
    COALESCE(sg.relationship, 'guardian') AS relationship,
    s.self_profile_id
  FROM public.student_guardians sg
  INNER JOIN public.students s
    ON s.id = sg.student_id
  WHERE sg.guardian_profile_id = auth.uid()
    AND s.self_profile_id IS DISTINCT FROM auth.uid()

  ORDER BY full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated;

DROP FUNCTION IF EXISTS public.get_student_dashboard(uuid);
CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  date_of_birth date,
  age integer,
  current_distance_m integer,
  category text,
  level text,
  student_is_active boolean,
  membership_name text,
  membership_start date,
  membership_end date,
  membership_status text,
  classes_total integer,
  classes_used integer,
  classes_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.date_of_birth,
    CASE
      WHEN s.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(current_date, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    s.category,
    s.level,
    s.is_active AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_used,
    sm.classes_remaining
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.custom_name,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.status,
      sm_inner.classes_total,
      sm_inner.classes_used,
      sm_inner.classes_remaining
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = s.id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active' THEN 0
        WHEN sm_inner.status = 'draft' THEN 1
        ELSE 2
      END,
      COALESCE(sm_inner.end_date, DATE '9999-12-31') DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_dashboard(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_next_booking();
DROP FUNCTION IF EXISTS public.get_my_next_booking(uuid);
CREATE OR REPLACE FUNCTION public.get_my_next_booking(p_student_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_result json;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT json_build_object(
    'start_at', s.start_at,
    'distance_m', COALESCE(b.distance_m, s.distance),
    'booking_id', b.id
  )
  INTO v_result
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
    AND b.status = 'reserved'
    AND s.start_at >= now()
  ORDER BY s.start_at ASC
  LIMIT 1;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_next_booking(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_booking_history_paginated(integer, integer);
DROP FUNCTION IF EXISTS public.get_my_booking_history_paginated(integer, integer, uuid);
CREATE OR REPLACE FUNCTION public.get_my_booking_history_paginated(
  page_number integer,
  page_size integer,
  p_student_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  start_at timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_offset integer;
BEGIN
  IF page_number < 1 THEN
    RAISE EXCEPTION 'page_number debe ser mayor o igual a 1';
  END IF;

  IF page_size < 1 OR page_size > 100 THEN
    RAISE EXCEPTION 'page_size debe estar entre 1 y 100';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  v_offset := (page_number - 1) * page_size;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    s.start_at,
    b.status::text AS status
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
  ORDER BY s.start_at DESC
  LIMIT page_size
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista los alumnos accesibles para la cuenta autenticada. Incluye self para alumnos con cuenta propia y relaciones guardian para tutores.';

COMMENT ON FUNCTION public.get_student_dashboard(uuid) IS
  'Retorna el resumen V2 de un alumno accesible para la cuenta autenticada. Si p_student_id es null, resuelve self o el unico hijo vinculado.';

COMMENT ON FUNCTION public.get_my_next_booking(uuid) IS
  'Retorna la siguiente reserva del alumno accesible. Acepta p_student_id opcional para tutores.';

COMMENT ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) IS
  'Retorna el historial paginado del alumno accesible. Acepta p_student_id opcional para tutores.';



-- SOURCE: 20260228_create_student_booking_rpcs.sql

-- ============================================================================
-- STUDENT BOOKING RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Reservar y cancelar por student_id
-- 2. Exponer listado y detalle de reservas para alumno y tutor
-- 3. Registrar movimientos en student_credit_ledger
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_student_bookings(uuid);
CREATE OR REPLACE FUNCTION public.get_student_bookings(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  booking_id uuid,
  status text,
  group_type text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer,
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.status::text,
    b.group_type::text,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage,
    s.start_at,
    s.end_at
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
  ORDER BY s.start_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_bookings(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_booking_detail(uuid);
CREATE OR REPLACE FUNCTION public.get_booking_detail(p_booking_id uuid)
RETURNS TABLE (
  booking_id uuid,
  student_id uuid,
  status text,
  group_type text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer,
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.student_id,
    b.status::text,
    b.group_type::text,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage,
    s.start_at,
    s.end_at
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.id = p_booking_id
    AND public.can_access_student(b.student_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_detail(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.book_session(uuid);
DROP FUNCTION IF EXISTS public.book_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= current_date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= current_date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(
    p_session,
    v_student_id
  );

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    v_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    'Reserva realizada desde la app',
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.cancel_booking(uuid);
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_session public.sessions;
  v_membership public.student_memberships;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF NOT public.can_access_student(v_booking.student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta reserva';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes cancelar reservas activas';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'La clase ya comenzo o finalizo';
  END IF;

  IF v_session.start_at < (now() + interval '4 hours') THEN
    RAISE EXCEPTION 'Solo puedes cancelar hasta 4 horas antes de la clase';
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL THEN
    SELECT *
    INTO v_membership
    FROM public.student_memberships
    WHERE id = v_booking.active_membership_id
    FOR UPDATE;

    IF v_membership IS NOT NULL THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_membership.id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_membership.id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion dentro de la ventana permitida',
        v_actor_id,
        now()
      );
    END IF;
  END IF;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_student_bookings(uuid) IS
  'Lista las reservas del alumno accesible para alumno o tutor.';

COMMENT ON FUNCTION public.get_booking_detail(uuid) IS
  'Retorna el detalle de una reserva accesible por alumno o tutor.';

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion para el alumno accesible y descuenta un credito de la membresia activa.';

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva accesible y devuelve el credito si se cancela con al menos 4 horas de anticipacion.';



-- SOURCE: 20260228_create_admin_attendance_v2_rpcs.sql

-- ============================================================================
-- ADMIN ATTENDANCE V2 RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Exponer roster diario sobre students + bookings.student_id
-- 2. Marcar asistencia con contrato JSON estable para frontend
-- 3. Cancelar una reserva individual desde asistencia devolviendo credito opcional
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_daily_roster(date);
CREATE OR REPLACE FUNCTION public.get_daily_roster(p_date date)
RETURNS TABLE (
  booking_id uuid,
  session_id uuid,
  session_start_at timestamptz,
  student_id uuid,
  student_name text,
  student_avatar_url text,
  booking_status text,
  admin_notes text,
  distance_m integer,
  bow_usage_type text,
  bow_poundage integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden ver el roster diario';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.session_id,
    s.start_at AS session_start_at,
    st.id AS student_id,
    st.full_name AS student_name,
    st.avatar_url AS student_avatar_url,
    b.status::text AS booking_status,
    b.admin_notes,
    b.distance_m,
    b.bow_usage_type,
    b.bow_poundage
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  INNER JOIN public.students st
    ON st.id = b.student_id
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = p_date
    AND b.status IN ('reserved', 'attended', 'no_show')
  ORDER BY s.start_at ASC, st.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_roster(date) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_mark_attendance(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_mark_attendance(
  p_booking_id uuid,
  p_attended boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_new_status text;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar asistencia';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status NOT IN ('reserved', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'La reserva no puede pasar por asistencia desde su estado actual';
  END IF;

  v_new_status := CASE WHEN p_attended THEN 'attended' ELSE 'no_show' END;

  UPDATE public.bookings
  SET
    status = v_new_status,
    attendance_marked_by = v_actor_id,
    attendance_marked_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'attendance_audit'
  ) THEN
    BEGIN
      INSERT INTO public.attendance_audit (
        booking_id,
        admin_id,
        status_before,
        status_after,
        note,
        created_at
      )
      VALUES (
        p_booking_id,
        v_actor_id,
        v_booking.status,
        v_new_status,
        CASE
          WHEN p_attended THEN 'Marcado como asistio desde admin'
          ELSE 'Marcado como no_show desde admin'
        END,
        now()
      );
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'previous_status', v_booking.status,
    'new_status', v_new_status,
    'message', CASE
      WHEN p_attended THEN 'Asistencia marcada correctamente'
      ELSE 'Marcado como no asistio'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_attendance(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_cancel_booking(uuid);
DROP FUNCTION IF EXISTS public.admin_cancel_booking(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id uuid,
  p_refund boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservas activas';
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  IF p_refund AND v_booking.active_membership_id IS NOT NULL THEN
    UPDATE public.student_memberships
    SET
      classes_used = GREATEST(classes_used - 1, 0),
      classes_remaining = classes_remaining + 1,
      updated_at = now()
    WHERE id = v_booking.active_membership_id
    RETURNING classes_remaining INTO v_balance_after;

    INSERT INTO public.student_credit_ledger (
      student_id,
      student_membership_id,
      booking_id,
      movement_type,
      delta,
      balance_after,
      reason,
      performed_by_profile_id,
      created_at
    )
    VALUES (
      v_booking.student_id,
      v_booking.active_membership_id,
      v_booking.id,
      'booking_cancelled_refund',
      1,
      v_balance_after,
      'Cancelacion individual desde asistencia/admin',
      v_actor_id,
      now()
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'message', CASE
      WHEN p_refund THEN 'Reserva cancelada y clase devuelta'
      ELSE 'Reserva cancelada'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_daily_roster(date) IS
  'Retorna el roster diario V2 para admin usando students y bookings.student_id.';

COMMENT ON FUNCTION public.admin_mark_attendance(uuid, boolean) IS
  'Marca asistencia o no_show sobre una reserva V2 y retorna JSON compatible con el frontend admin.';

COMMENT ON FUNCTION public.admin_cancel_booking(uuid, boolean) IS
  'Cancela una reserva individual desde admin/asistencia y devuelve credito opcionalmente.';



-- SOURCE: 20260228_create_admin_booking_management_rpcs.sql

-- ============================================================================
-- ADMIN BOOKING MANAGEMENT RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Permitir al admin reservar para cualquier alumno con el motor V3
-- 2. Permitir reservas forzadas cuando no haya cupo
-- 3. Permitir cancelar turnos completos con o sin reembolso
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS admin_notes text;

DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= current_date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= current_date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(
      p_session_id,
      p_student_id
    );

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    CASE
      WHEN p_force THEN 'Reserva forzada desde admin'
      ELSE 'Reserva realizada desde admin'
    END,
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_cancel_session(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_cancel_session(
  p_session uuid,
  p_refund boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_session public.sessions;
  v_booking record;
  v_balance_after integer;
  v_affected_count integer := 0;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  UPDATE public.sessions
  SET
    status = 'cancelled'
  WHERE id = p_session;

  FOR v_booking IN
    SELECT *
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.status = 'reserved'
    FOR UPDATE
  LOOP
    UPDATE public.bookings
    SET
      status = 'cancelled',
      cancelled_by_profile_id = v_actor_id,
      cancelled_at = now(),
      updated_at = now()
    WHERE id = v_booking.id;

    IF p_refund AND v_booking.active_membership_id IS NOT NULL THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_booking.active_membership_id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion de turno completa desde admin',
        v_actor_id,
        now()
      );
    END IF;

    v_affected_count := v_affected_count + 1;
  END LOOP;

  RETURN v_affected_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_session(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) IS
  'Reserva una sesion para cualquier alumno desde admin. Puede forzar la reserva si p_force = true.';

COMMENT ON FUNCTION public.admin_cancel_session(uuid, boolean) IS
  'Cancela un turno completo desde admin y opcionalmente devuelve las clases a las reservas afectadas.';



-- SOURCE: 20260228_create_admin_membership_management_rpcs.sql

-- ============================================================================
-- ADMIN MEMBERSHIP MANAGEMENT RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Permitir vender o renovar membresias V2 desde admin
-- 2. Acumular una renovacion sobre la membresia activa existente
-- 3. Registrar ledger inicial y pago opcional
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.admin_assign_membership_plan(
  p_student_id uuid,
  p_membership_plan_id uuid,
  p_start_date date DEFAULT current_date,
  p_total_amount numeric DEFAULT NULL,
  p_payment_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_plan public.membership_plans;
  v_active_membership public.student_memberships;
  v_membership_id uuid;
  v_start_date date;
  v_end_date date;
  v_total_amount numeric;
  v_payment_amount numeric;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.membership_plans
  WHERE id = p_membership_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan de membresia no encontrado';
  END IF;

  IF COALESCE(v_plan.is_active, true) = false THEN
    RAISE EXCEPTION 'El plan seleccionado esta inactivo';
  END IF;

  v_start_date := COALESCE(p_start_date, current_date);
  v_total_amount := COALESCE(p_total_amount, v_plan.base_price, 0);
  v_payment_amount := COALESCE(p_payment_amount, NULL);

  IF v_total_amount < 0 THEN
    RAISE EXCEPTION 'El monto total no puede ser negativo';
  END IF;

  IF v_payment_amount IS NOT NULL AND v_payment_amount < 0 THEN
    RAISE EXCEPTION 'El pago no puede ser negativo';
  END IF;

  IF v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN
    v_end_date := NULL;
  ELSE
    v_end_date := v_start_date + (v_plan.duration_days - 1);
  END IF;

  SELECT *
  INTO v_active_membership
  FROM public.student_memberships
  WHERE student_id = p_student_id
    AND status = 'active'
  ORDER BY start_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_active_membership IS NOT NULL THEN
    UPDATE public.student_memberships
    SET
      membership_plan_id = v_plan.id,
      custom_name = v_plan.name,
      classes_total = v_active_membership.classes_total + v_plan.classes_included,
      classes_remaining = v_active_membership.classes_remaining + v_plan.classes_included,
      start_date = LEAST(v_active_membership.start_date, v_start_date),
      end_date = CASE
        WHEN v_active_membership.end_date IS NULL OR v_end_date IS NULL THEN NULL
        ELSE GREATEST(v_active_membership.end_date, v_end_date)
      END,
      total_amount = COALESCE(v_active_membership.total_amount, 0) + v_total_amount,
      currency = COALESCE(v_plan.currency, v_active_membership.currency, 'PEN'),
      notes = CASE
        WHEN NULLIF(btrim(p_notes), '') IS NULL THEN v_active_membership.notes
        ELSE concat_ws(' | ', NULLIF(btrim(v_active_membership.notes), ''), NULLIF(btrim(p_notes), ''))
      END,
      sold_by_profile_id = v_actor_id,
      updated_at = now()
    WHERE id = v_active_membership.id
    RETURNING id, classes_remaining INTO v_membership_id, v_balance_after;

    INSERT INTO public.student_credit_ledger (
      student_id,
      student_membership_id,
      movement_type,
      delta,
      balance_after,
      reason,
      performed_by_profile_id,
      created_at
    )
    VALUES (
      p_student_id,
      v_membership_id,
      'membership_renewal',
      v_plan.classes_included,
      v_balance_after,
      format('Renovacion de plan %s', v_plan.name),
      v_actor_id,
      now()
    );
  ELSE
    INSERT INTO public.student_memberships (
      student_id,
      membership_plan_id,
      custom_name,
      classes_total,
      classes_used,
      classes_remaining,
      start_date,
      end_date,
      status,
      total_amount,
      currency,
      notes,
      sold_by_profile_id,
      created_at,
      updated_at
    )
    VALUES (
      p_student_id,
      v_plan.id,
      v_plan.name,
      v_plan.classes_included,
      0,
      v_plan.classes_included,
      v_start_date,
      v_end_date,
      'active',
      v_total_amount,
      COALESCE(v_plan.currency, 'PEN'),
      NULLIF(btrim(p_notes), ''),
      v_actor_id,
      now(),
      now()
    )
    RETURNING id, classes_remaining INTO v_membership_id, v_balance_after;

    INSERT INTO public.student_credit_ledger (
      student_id,
      student_membership_id,
      movement_type,
      delta,
      balance_after,
      reason,
      performed_by_profile_id,
      created_at
    )
    VALUES (
      p_student_id,
      v_membership_id,
      'membership_activation',
      v_plan.classes_included,
      v_balance_after,
      format('Activacion de plan %s', v_plan.name),
      v_actor_id,
      now()
    );
  END IF;

  IF v_payment_amount IS NOT NULL THEN
    INSERT INTO public.student_membership_payments (
      student_id,
      student_membership_id,
      due_date,
      paid_at,
      amount,
      currency,
      payment_method,
      payment_status,
      reward_credits,
      reward_reason,
      notes,
      source,
      recorded_by_profile_id,
      created_at
    )
    VALUES (
      p_student_id,
      v_membership_id,
      v_start_date,
      now(),
      v_payment_amount,
      COALESCE(v_plan.currency, 'PEN'),
      'admin_manual',
      CASE
        WHEN v_payment_amount > 0 THEN 'paid'
        ELSE 'waived'
      END,
      0,
      NULL,
      CASE
        WHEN v_active_membership IS NOT NULL THEN 'Pago registrado al renovar la membresia'
        ELSE 'Pago inicial registrado al vender la membresia'
      END,
      CASE
        WHEN v_active_membership IS NOT NULL THEN 'admin_renewal'
        ELSE 'admin_assignment'
      END,
      v_actor_id,
      now()
    );
  END IF;

  RETURN v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) IS
  'Vende o renueva una membresia V2 para un alumno. Si ya existe una activa, acumula nuevas clases sobre la misma membresia y registra ledger/pago en ese mismo registro.';



-- SOURCE: 20260228_create_admin_membership_edit_rpcs.sql

-- ============================================================================
-- ADMIN MEMBERSHIP EDIT RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Permitir editar membresias V2 desde admin
-- 2. Permitir eliminar membresias sin historial de reservas asociado
-- 3. Mantener consistencia de una sola membresia activa por alumno
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_update_student_membership(
  uuid,
  text,
  date,
  date,
  text,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
);
CREATE OR REPLACE FUNCTION public.admin_update_student_membership(
  p_membership_id uuid,
  p_custom_name text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_classes_total integer DEFAULT NULL,
  p_classes_used integer DEFAULT NULL,
  p_classes_remaining integer DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.student_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_membership public.student_memberships;
  v_new_status text;
  v_new_total integer;
  v_new_used integer;
  v_new_remaining integer;
  v_new_amount numeric;
  v_updated public.student_memberships;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'Membresia no encontrada';
  END IF;

  v_new_status := COALESCE(NULLIF(btrim(p_status), ''), v_membership.status);
  v_new_total := COALESCE(p_classes_total, v_membership.classes_total);
  v_new_used := COALESCE(p_classes_used, v_membership.classes_used);
  v_new_remaining := COALESCE(p_classes_remaining, v_membership.classes_remaining);
  v_new_amount := COALESCE(p_total_amount, v_membership.total_amount);

  IF v_new_status NOT IN ('draft', 'active', 'expired', 'cancelled', 'consumed', 'historical') THEN
    RAISE EXCEPTION 'Estado de membresia invalido';
  END IF;

  IF v_new_total < 0 OR v_new_used < 0 OR v_new_remaining < 0 THEN
    RAISE EXCEPTION 'Las clases no pueden ser negativas';
  END IF;

  IF v_new_used > v_new_total THEN
    RAISE EXCEPTION 'Las clases usadas no pueden superar el total';
  END IF;

  IF v_new_amount < 0 THEN
    RAISE EXCEPTION 'El monto total no puede ser negativo';
  END IF;

  IF v_new_status IN ('expired', 'cancelled', 'consumed', 'historical') THEN
    v_new_remaining := 0;
  END IF;

  IF v_new_status = 'active' THEN
    UPDATE public.student_memberships
    SET
      status = 'historical',
      updated_at = now()
    WHERE student_id = v_membership.student_id
      AND id <> v_membership.id
      AND status = 'active';
  END IF;

  UPDATE public.student_memberships
  SET
    custom_name = COALESCE(NULLIF(btrim(p_custom_name), ''), custom_name),
    start_date = COALESCE(p_start_date, start_date),
    end_date = p_end_date,
    status = v_new_status,
    classes_total = v_new_total,
    classes_used = v_new_used,
    classes_remaining = v_new_remaining,
    total_amount = v_new_amount,
    currency = COALESCE(NULLIF(btrim(p_currency), ''), currency),
    notes = p_notes,
    updated_at = now()
  WHERE id = p_membership_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_student_membership(
  uuid,
  text,
  date,
  date,
  text,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_delete_student_membership(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_student_membership(
  p_membership_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_membership public.student_memberships;
  v_booking_count integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'Membresia no encontrada';
  END IF;

  SELECT COUNT(*)
  INTO v_booking_count
  FROM public.bookings
  WHERE active_membership_id = p_membership_id;

  IF v_booking_count > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar una membresia con reservas asociadas';
  END IF;

  DELETE FROM public.student_membership_payments
  WHERE student_membership_id = p_membership_id;

  DELETE FROM public.student_credit_ledger
  WHERE student_membership_id = p_membership_id;

  DELETE FROM public.student_memberships
  WHERE id = p_membership_id;

  RETURN json_build_object(
    'success', true,
    'membership_id', p_membership_id,
    'message', 'Membresia eliminada correctamente'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'membership_id', p_membership_id,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_student_membership(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_update_student_membership(
  uuid,
  text,
  date,
  date,
  text,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
) IS
  'Permite editar una membresia V2 desde admin y mantiene una sola membresia activa por alumno.';

COMMENT ON FUNCTION public.admin_delete_student_membership(uuid) IS
  'Elimina una membresia V2 solo si no tiene reservas asociadas. Borra tambien pagos y ledger derivados.';



-- SOURCE: 20260228_create_student_class_cards_rpc.sql

-- ============================================================================
-- STUDENT CLASS CARDS RPC
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Exponer cards visuales por clase de la membresia activa o mas reciente
-- 2. Vincular cada clase usada a su booking real cuando exista
-- 3. Dejar disponibles las clases aun no reservadas
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_student_class_cards(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_student_class_cards(
  p_student_id uuid DEFAULT NULL,
  p_student_membership_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_membership_id uuid,
  membership_name text,
  membership_status text,
  classes_total integer,
  classes_remaining integer,
  card_index integer,
  card_status text,
  booking_id uuid,
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  distance_m integer,
  bow_usage_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_membership_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  IF p_student_membership_id IS NOT NULL THEN
    SELECT sm.id
    INTO v_membership_id
    FROM public.student_memberships sm
    WHERE sm.id = p_student_membership_id
      AND sm.student_id = v_student_id;

    IF v_membership_id IS NULL THEN
      RAISE EXCEPTION 'Membresia no accesible para este alumno';
    END IF;
  ELSE
    SELECT sm.id
    INTO v_membership_id
    FROM public.student_memberships sm
    WHERE sm.student_id = v_student_id
    ORDER BY
      CASE
        WHEN sm.status = 'active' THEN 0
        WHEN sm.status = 'draft' THEN 1
        ELSE 2
      END,
      COALESCE(sm.end_date, DATE '9999-12-31') DESC,
      sm.created_at DESC
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH selected_membership AS (
    SELECT
      sm.id,
      sm.custom_name,
      sm.status,
      sm.classes_total,
      sm.classes_remaining
    FROM public.student_memberships sm
    WHERE sm.id = v_membership_id
  ),
  membership_bookings AS (
    SELECT
      row_number() OVER (
        ORDER BY
          COALESCE(s.start_at, b.created_at) ASC,
          b.created_at ASC,
          b.id ASC
      )::integer AS booking_position,
      b.id AS booking_id,
      b.session_id,
      s.start_at,
      s.end_at,
      b.distance_m,
      b.bow_usage_type,
      b.status::text AS card_status
    FROM public.bookings b
    LEFT JOIN public.sessions s
      ON s.id = b.session_id
    WHERE b.student_id = v_student_id
      AND b.active_membership_id = v_membership_id
      AND b.status IN ('reserved', 'attended', 'no_show')
  )
  SELECT
    sm.id AS student_membership_id,
    sm.custom_name AS membership_name,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_remaining,
    slot.card_index,
    COALESCE(mb.card_status, 'available') AS card_status,
    mb.booking_id,
    mb.session_id,
    mb.start_at,
    mb.end_at,
    mb.distance_m,
    mb.bow_usage_type
  FROM selected_membership sm
  CROSS JOIN LATERAL generate_series(1, sm.classes_total) AS slot(card_index)
  LEFT JOIN membership_bookings mb
    ON mb.booking_position = slot.card_index
  ORDER BY slot.card_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_class_cards(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_student_class_cards(uuid, uuid) IS
  'Retorna las cards visuales por clase de la membresia activa o mas reciente del alumno accesible.';



-- SOURCE: 20260228_create_weekly_session_generation_rpcs.sql

-- ============================================================================
-- WEEKLY SESSION GENERATION RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Generar sesiones reales desde plantillas semanales activas
-- 2. Copiar cupos por distancia a cada sesion creada
-- 3. Evitar duplicados por weekly_template_id + start_at
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_generate_sessions_from_templates(date, integer);
CREATE OR REPLACE FUNCTION public.admin_generate_sessions_from_templates(
  p_week_start date DEFAULT current_date,
  p_weeks integer DEFAULT 4
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_week_start date;
  v_template record;
  v_session_id uuid;
  v_iteration integer;
  v_session_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_created_count integer := 0;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_weeks < 1 OR p_weeks > 24 THEN
    RAISE EXCEPTION 'p_weeks debe estar entre 1 y 24';
  END IF;

  v_week_start := p_week_start - ((EXTRACT(ISODOW FROM p_week_start)::integer) - 1);

  FOR v_template IN
    SELECT
      wst.id,
      wst.label,
      wst.weekday,
      wst.start_time,
      wst.end_time
    FROM public.weekly_session_templates wst
    WHERE wst.is_active = true
    ORDER BY wst.weekday ASC, wst.start_time ASC
  LOOP
    FOR v_iteration IN 0..(p_weeks - 1) LOOP
      v_session_date := v_week_start + ((v_template.weekday - 1) + (v_iteration * 7));
      v_start_at := timezone('America/Lima', (v_session_date + v_template.start_time)::timestamp);
      v_end_at := timezone('America/Lima', (v_session_date + v_template.end_time)::timestamp);

      IF NOT EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.weekly_template_id = v_template.id
          AND s.start_at = v_start_at
      ) THEN
        INSERT INTO public.sessions (
          start_at,
          end_at,
          status,
          notes,
          weekly_template_id,
          is_manual_override
        )
        VALUES (
          v_start_at,
          v_end_at,
          'scheduled',
          COALESCE(v_template.label, 'Turno semanal generado'),
          v_template.id,
          false
        )
        RETURNING id INTO v_session_id;

        INSERT INTO public.session_distance_allocations (
          session_id,
          distance_m,
          targets,
          slot_capacity
        )
        SELECT
          v_session_id,
          wstd.distance_m,
          CEIL(wstd.slot_capacity::numeric / 4.0)::integer,
          wstd.slot_capacity
        FROM public.weekly_session_template_distances wstd
        WHERE wstd.weekly_template_id = v_template.id
          AND wstd.slot_capacity > 0;

        v_created_count := v_created_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_created_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_sessions_from_templates(date, integer) TO authenticated;

COMMENT ON FUNCTION public.admin_generate_sessions_from_templates(date, integer) IS
  'Genera sesiones reales desde plantillas semanales activas y copia sus cupos por distancia.';



-- SOURCE: 20260228_prepare_access_code_login.sql

-- ============================================================================
-- PREPARE ACCESS CODE LOGIN
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Normalizar profiles.access_code para login por codigo
-- 2. Mantener compatibilidad temporal con codigos legacy
-- 3. Exponer una funcion util para generar nuevos codigos
-- ============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN access_code TYPE text
  USING NULLIF(upper(btrim(access_code::text)), '');

UPDATE public.profiles
SET access_code = upper(btrim(access_code))
WHERE access_code IS NOT NULL;

DROP INDEX IF EXISTS idx_profiles_access_code_unique;
CREATE UNIQUE INDEX idx_profiles_access_code_unique
  ON public.profiles(access_code)
  WHERE access_code IS NOT NULL;

COMMENT ON COLUMN public.profiles.access_code IS
  'Codigo de acceso administrado por la academia. Objetivo actual: 6 caracteres alfanumericos en mayusculas. Durante la transicion pueden existir codigos legacy.';

CREATE OR REPLACE FUNCTION public.generate_access_code(p_length integer DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_index integer;
BEGIN
  IF p_length < 6 THEN
    RAISE EXCEPTION 'El largo minimo del access_code es 6';
  END IF;

  FOR v_index IN 1..p_length LOOP
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
  END LOOP;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_access_code(integer) IS
  'Genera un codigo de acceso alfanumerico en mayusculas para cuentas gestionadas por la academia.';



-- SOURCE: 20260228_fix_dni_columns_to_text.sql

-- ============================================================================
-- FIX DNI COLUMN TYPES
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Evitar problemas con columnas dni definidas como character ambiguo
-- 2. Normalizar dni a text en profiles y students
-- 3. Mantener validacion de 8 digitos por constraint
-- ============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN dni TYPE text
  USING NULLIF(btrim(dni::text), '');

ALTER TABLE public.students
  ALTER COLUMN dni TYPE text
  USING NULLIF(btrim(dni::text), '');

DROP INDEX IF EXISTS idx_profiles_dni_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_dni_unique
  ON public.profiles(dni)
  WHERE dni IS NOT NULL;

DROP INDEX IF EXISTS idx_students_dni_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_dni_unique
  ON public.students(dni)
  WHERE dni IS NOT NULL;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_dni_format_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_dni_format_chk
  CHECK (dni IS NULL OR dni ~ '^[0-9]{8}$');

COMMENT ON COLUMN public.profiles.dni IS
  'DNI de 8 digitos. Se almacena como text para evitar problemas de padding o tipos character heredados.';

COMMENT ON COLUMN public.students.dni IS
  'DNI de 8 digitos del alumno. Se almacena como text para evitar problemas de padding o tipos character heredados.';



-- SOURCE: 20260228_add_student_division_gender_category_logic.sql

-- ============================================================================
-- STUDENT DIVISION/GENDER CATEGORY LOGIC
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Agregar division y gender al alumno
-- 2. Calcular categoria dinamica por anio de nacimiento
-- 3. Mantener category como campo de compatibilidad
-- ============================================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_division_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_division_chk
  CHECK (division IS NULL OR division IN ('Recurvo', 'Compuesto', 'Raso'));

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_gender_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_gender_chk
  CHECK (gender IS NULL OR gender IN ('varones', 'damas'));

UPDATE public.students
SET division = CASE
  WHEN division IS NOT NULL THEN division
  WHEN category ILIKE 'Recurvo %' THEN 'Recurvo'
  WHEN category ILIKE 'Compuesto %' THEN 'Compuesto'
  WHEN category ILIKE 'Raso %' THEN 'Raso'
  ELSE NULL
END,
gender = CASE
  WHEN gender IS NOT NULL THEN gender
  WHEN category ILIKE '% damas' THEN 'damas'
  WHEN category ILIKE '% varones' THEN 'varones'
  ELSE NULL
END;

DROP FUNCTION IF EXISTS public.get_student_age_category(date, date);
CREATE OR REPLACE FUNCTION public.get_student_age_category(
  p_date_of_birth date,
  p_reference_date date DEFAULT current_date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_turning_age integer;
BEGIN
  IF p_date_of_birth IS NULL THEN
    RETURN NULL;
  END IF;

  v_turning_age := EXTRACT(YEAR FROM p_reference_date)::integer - EXTRACT(YEAR FROM p_date_of_birth)::integer;

  IF v_turning_age <= 9 THEN
    RETURN 'U10';
  ELSIF v_turning_age <= 12 THEN
    RETURN 'U13';
  ELSIF v_turning_age <= 14 THEN
    RETURN 'U15';
  ELSIF v_turning_age <= 17 THEN
    RETURN 'U18';
  ELSIF v_turning_age <= 20 THEN
    RETURN 'U21';
  ELSIF v_turning_age <= 49 THEN
    RETURN 'Mayores';
  END IF;

  RETURN 'Senior';
END;
$$;

DROP FUNCTION IF EXISTS public.build_student_category(date, text, text, date);
CREATE OR REPLACE FUNCTION public.build_student_category(
  p_date_of_birth date,
  p_division text,
  p_gender text,
  p_reference_date date DEFAULT current_date
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    concat_ws(
      ' ',
      NULLIF(btrim(p_division), ''),
      public.get_student_age_category(p_date_of_birth, p_reference_date),
      NULLIF(btrim(p_gender), '')
    ),
    ''
  )
$$;

UPDATE public.students
SET category = public.build_student_category(date_of_birth, division, gender, current_date)
WHERE division IS NOT NULL
   OR gender IS NOT NULL
   OR date_of_birth IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_student_dashboard(uuid);
CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  date_of_birth date,
  age integer,
  current_distance_m integer,
  category text,
  level text,
  student_is_active boolean,
  membership_name text,
  membership_start date,
  membership_end date,
  membership_status text,
  classes_total integer,
  classes_used integer,
  classes_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.date_of_birth,
    CASE
      WHEN s.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(current_date, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    COALESCE(
      public.build_student_category(s.date_of_birth, s.division, s.gender, current_date),
      s.category
    ) AS category,
    s.level,
    s.is_active AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_used,
    sm.classes_remaining
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.custom_name,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.status,
      sm_inner.classes_total,
      sm_inner.classes_used,
      sm_inner.classes_remaining
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = s.id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active' THEN 0
        WHEN sm_inner.status = 'draft' THEN 1
        ELSE 2
      END,
      COALESCE(sm_inner.end_date, DATE '9999-12-31') DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_age_category(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_student_category(date, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_dashboard(uuid) TO authenticated;

COMMENT ON COLUMN public.students.division IS
  'Division tecnica del alumno: Recurvo, Compuesto o Raso.';

COMMENT ON COLUMN public.students.gender IS
  'Genero competitivo del alumno: varones o damas.';



-- SOURCE: 20260304_enrich_children_and_history.sql

-- ============================================================================
-- UI ENRICHMENT MIGRATIONS
-- Fecha: 2026-03-04
-- U5: get_my_children ahora incluye classes_remaining y próxima reserva
-- U7: get_my_booking_history_paginated ahora incluye distance_m y bow_usage_type
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- U5: get_my_children con resumen de membresía y próxima reserva
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_children();
CREATE OR REPLACE FUNCTION public.get_my_children()
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  current_distance_m integer,
  level text,
  is_active boolean,
  relationship text,
  self_profile_id uuid,
  classes_remaining integer,
  membership_status text,
  next_booking_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    base.student_id,
    base.full_name,
    base.avatar_url,
    base.current_distance_m,
    base.level,
    base.is_active,
    base.relationship,
    base.self_profile_id,
    sm.classes_remaining,
    sm.status::text AS membership_status,
    nb.start_at AS next_booking_at
  FROM (
    -- Self students
    SELECT
      s.id AS student_id,
      s.full_name,
      s.avatar_url,
      s.current_distance_m,
      s.level,
      s.is_active,
      'self'::text AS relationship,
      s.self_profile_id
    FROM public.students s
    WHERE s.self_profile_id = auth.uid()

    UNION ALL

    -- Guardian children
    SELECT
      s.id AS student_id,
      s.full_name,
      s.avatar_url,
      s.current_distance_m,
      s.level,
      s.is_active,
      COALESCE(sg.relationship, 'guardian') AS relationship,
      s.self_profile_id
    FROM public.student_guardians sg
    INNER JOIN public.students s
      ON s.id = sg.student_id
    WHERE sg.guardian_profile_id = auth.uid()
      AND s.self_profile_id IS DISTINCT FROM auth.uid()
  ) base
  -- Membresía activa más reciente
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.classes_remaining,
      sm_inner.status
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = base.student_id
      AND sm_inner.status = 'active'
      AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= current_date)
    ORDER BY sm_inner.start_date DESC
    LIMIT 1
  ) sm ON true
  -- Próxima reserva
  LEFT JOIN LATERAL (
    SELECT s_sess.start_at
    FROM public.bookings b_next
    INNER JOIN public.sessions s_sess ON s_sess.id = b_next.session_id
    WHERE b_next.student_id = base.student_id
      AND b_next.status = 'reserved'
      AND s_sess.start_at > now()
    ORDER BY s_sess.start_at ASC
    LIMIT 1
  ) nb ON true
  ORDER BY base.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- U7: get_my_booking_history_paginated con distancia y tipo de arco
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_booking_history_paginated(integer, integer);
DROP FUNCTION IF EXISTS public.get_my_booking_history_paginated(integer, integer, uuid);
CREATE OR REPLACE FUNCTION public.get_my_booking_history_paginated(
  page_number integer,
  page_size integer,
  p_student_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  start_at timestamptz,
  status text,
  distance_m integer,
  bow_usage_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_offset integer;
BEGIN
  IF page_number < 1 THEN
    RAISE EXCEPTION 'page_number debe ser mayor o igual a 1';
  END IF;

  IF page_size < 1 OR page_size > 100 THEN
    RAISE EXCEPTION 'page_size debe estar entre 1 y 100';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  v_offset := (page_number - 1) * page_size;

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    s.start_at,
    b.status::text AS status,
    b.distance_m,
    b.bow_usage_type
  FROM public.bookings b
  INNER JOIN public.sessions s
    ON s.id = b.session_id
  WHERE b.student_id = v_student_id
  ORDER BY s.start_at DESC
  LIMIT page_size
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista los alumnos accesibles con resumen de membresia (classes_remaining, status) y proxima reserva.';

COMMENT ON FUNCTION public.get_my_booking_history_paginated(integer, integer, uuid) IS
  'Historial paginado con distance_m y bow_usage_type para mostrar detalles en el frontend.';



-- SOURCE: 20260304_fix_cancel_booking_expired_membership.sql

-- ============================================================================
-- FIX: Cancelacion no debe devolver credito a membresia expirada
-- Fecha: 2026-03-04
-- Proposito:
-- 1. cancel_booking: Si la membresia vinculada ya expiro, no devolver credito
-- 2. admin_cancel_booking: Misma logica, salvo que p_refund=true fuerza reembolso
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. cancel_booking (alumno/tutor)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_booking(uuid);
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_session public.sessions;
  v_membership public.student_memberships;
  v_balance_after integer;
  v_membership_is_valid boolean;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF NOT public.can_access_student(v_booking.student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta reserva';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes cancelar reservas activas';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'La clase ya comenzo o finalizo';
  END IF;

  IF v_session.start_at < (now() + interval '4 hours') THEN
    RAISE EXCEPTION 'Solo puedes cancelar hasta 4 horas antes de la clase';
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking
  RETURNING * INTO v_booking;

  IF v_booking.active_membership_id IS NOT NULL THEN
    SELECT *
    INTO v_membership
    FROM public.student_memberships
    WHERE id = v_booking.active_membership_id
    FOR UPDATE;

    -- Solo devolver credito si la membresia sigue vigente
    v_membership_is_valid := v_membership IS NOT NULL
      AND v_membership.status = 'active'
      AND (v_membership.end_date IS NULL OR v_membership.end_date >= current_date);

    IF v_membership_is_valid THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_membership.id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_membership.id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion dentro de la ventana permitida',
        v_actor_id,
        now()
      );
    ELSE
      -- Registrar que no se devolvio credito porque la membresia expiro
      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_no_refund',
        0,
        COALESCE(v_membership.classes_remaining, 0),
        'Cancelacion sin devolucion: membresia expirada o inactiva',
        v_actor_id,
        now()
      );
    END IF;
  END IF;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. admin_cancel_booking (admin)
--    Si p_refund = true, devuelve credito SOLO si la membresia sigue vigente
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_cancel_booking(uuid);
DROP FUNCTION IF EXISTS public.admin_cancel_booking(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id uuid,
  p_refund boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_balance_after integer;
  v_membership_is_valid boolean;
  v_refunded boolean := false;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservas activas';
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  IF p_refund AND v_booking.active_membership_id IS NOT NULL THEN
    SELECT *
    INTO v_membership
    FROM public.student_memberships
    WHERE id = v_booking.active_membership_id
    FOR UPDATE;

    v_membership_is_valid := v_membership IS NOT NULL
      AND v_membership.status = 'active'
      AND (v_membership.end_date IS NULL OR v_membership.end_date >= current_date);

    IF v_membership_is_valid THEN
      UPDATE public.student_memberships
      SET
        classes_used = GREATEST(classes_used - 1, 0),
        classes_remaining = classes_remaining + 1,
        updated_at = now()
      WHERE id = v_booking.active_membership_id
      RETURNING classes_remaining INTO v_balance_after;

      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_refund',
        1,
        v_balance_after,
        'Cancelacion individual desde admin',
        v_actor_id,
        now()
      );

      v_refunded := true;
    ELSE
      INSERT INTO public.student_credit_ledger (
        student_id,
        student_membership_id,
        booking_id,
        movement_type,
        delta,
        balance_after,
        reason,
        performed_by_profile_id,
        created_at
      )
      VALUES (
        v_booking.student_id,
        v_booking.active_membership_id,
        v_booking.id,
        'booking_cancelled_no_refund',
        0,
        COALESCE(v_membership.classes_remaining, 0),
        'Cancelacion admin sin devolucion: membresia expirada o inactiva',
        v_actor_id,
        now()
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'refunded', v_refunded,
    'message', CASE
      WHEN v_refunded THEN 'Reserva cancelada y clase devuelta'
      WHEN p_refund AND NOT v_refunded THEN 'Reserva cancelada. Clase NO devuelta (membresia expirada)'
      ELSE 'Reserva cancelada'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.cancel_booking(uuid) IS
  'Cancela una reserva accesible. Devuelve credito solo si la membresia sigue activa y vigente.';

COMMENT ON FUNCTION public.admin_cancel_booking(uuid, boolean) IS
  'Cancela una reserva desde admin. Devuelve credito solo si p_refund=true Y la membresia esta vigente. Registra en ledger en ambos casos.';



-- SOURCE: 20260304_fix_dashboard_expired_membership.sql

-- ============================================================================
-- FIX: get_student_dashboard debe mostrar 0 clases si la membresia expiro
-- Fecha: 2026-03-04
-- Proposito:
--   Cuando la membresia mas reciente tiene status='active' pero end_date < hoy,
--   el dashboard mostraba classes_remaining > 0 aunque el alumno no puede reservar.
--   Ahora se prioriza membresias que esten vigentes (end_date >= hoy o null).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  date_of_birth date,
  age integer,
  current_distance_m integer,
  category text,
  level text,
  student_is_active boolean,
  membership_name text,
  membership_start date,
  membership_end date,
  membership_status text,
  classes_total integer,
  classes_used integer,
  classes_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.date_of_birth,
    CASE
      WHEN s.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(current_date, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    s.category,
    s.level,
    s.is_active AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_used,
    -- Si la membresia expiro, reportar 0 clases restantes aunque haya saldo
    CASE
      WHEN sm.end_date IS NOT NULL AND sm.end_date < current_date THEN 0
      ELSE COALESCE(sm.classes_remaining, 0)
    END AS classes_remaining
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.custom_name,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.status,
      sm_inner.classes_total,
      sm_inner.classes_used,
      sm_inner.classes_remaining
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = s.id
    ORDER BY
      -- Primero: membresias activas Y vigentes
      CASE
        WHEN sm_inner.status = 'active'
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= current_date)
        THEN 0
      -- Segundo: membresias activas pero expiradas
        WHEN sm_inner.status = 'active' THEN 1
        WHEN sm_inner.status = 'draft' THEN 2
        ELSE 3
      END,
      COALESCE(sm_inner.end_date, DATE '9999-12-31') DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

COMMENT ON FUNCTION public.get_student_dashboard(uuid) IS
  'Retorna el resumen V2 de un alumno. Prioriza membresias vigentes y reporta 0 clases si la membresia expiro.';



-- SOURCE: 20260304_fix_mark_attendance_enum_cast.sql

-- ============================================================================
-- FIX: admin_mark_attendance - cast text a booking_status enum
-- Fecha: 2026-03-04
-- Error: column "status" is of type booking_status but expression is of type text
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_mark_attendance(
  p_booking_id uuid,
  p_attended boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_booking public.bookings;
  v_new_status public.booking_status;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar asistencia';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_booking.status NOT IN ('reserved', 'attended', 'no_show') THEN
    RAISE EXCEPTION 'La reserva no puede pasar por asistencia desde su estado actual';
  END IF;

  v_new_status := CASE WHEN p_attended THEN 'attended'::public.booking_status ELSE 'no_show'::public.booking_status END;

  UPDATE public.bookings
  SET
    status = v_new_status,
    attendance_marked_by = v_actor_id,
    attendance_marked_at = now(),
    updated_at = now()
  WHERE id = p_booking_id;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'attendance_audit'
  ) THEN
    BEGIN
      INSERT INTO public.attendance_audit (
        booking_id,
        admin_id,
        status_before,
        status_after,
        note,
        created_at
      )
      VALUES (
        p_booking_id,
        v_actor_id,
        v_booking.status,
        v_new_status,
        CASE
          WHEN p_attended THEN 'Marcado como asistio desde admin'
          ELSE 'Marcado como no_show desde admin'
        END,
        now()
      );
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'previous_status', v_booking.status,
    'new_status', v_new_status,
    'message', CASE
      WHEN p_attended THEN 'Asistencia marcada correctamente'
      ELSE 'Marcado como no asistio'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'booking_id', p_booking_id
    );
END;
$$;



-- SOURCE: 20260305_admin_access_keys_rpc.sql

-- ============================================================================
-- ADMIN ACCESS KEYS MANAGEMENT RPCs (FIX)
-- Fecha: 2026-03-05
-- Fix: Eliminar acceso a auth.users que causa 400 en PostgREST
-- ============================================================================

-- Eliminar version anterior con tipo de retorno diferente
DROP FUNCTION IF EXISTS public.admin_list_access_keys();

-- 1. Listar todas las claves de acceso (sin acceder a auth.users)
CREATE OR REPLACE FUNCTION public.admin_list_access_keys()
RETURNS TABLE(
  profile_id uuid,
  full_name text,
  role text,
  access_code text,
  email text,
  is_active boolean,
  related_student_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.full_name::text,
    p.role::text,
    p.access_code::text,
    p.email::text,
    COALESCE(p.is_active, true) AS is_active,
    (
      SELECT string_agg(s.full_name, ', ')
      FROM public.student_guardians sg
      INNER JOIN public.students s ON s.id = sg.student_id
      WHERE sg.guardian_profile_id = p.id
    )::text AS related_student_name
  FROM public.profiles p
  WHERE p.role IN ('student', 'guardian', 'admin')
  ORDER BY
    CASE p.role
      WHEN 'admin' THEN 0
      WHEN 'guardian' THEN 1
      WHEN 'student' THEN 2
      ELSE 3
    END,
    p.full_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.admin_list_access_keys() IS
  'Lista todos los perfiles con su clave de acceso, rol y email. Solo admins.';

-- 2. Actualizar o asignar manualmente una clave de acceso
CREATE OR REPLACE FUNCTION public.admin_upsert_access_code(
  p_profile_id uuid,
  p_new_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores.';
  END IF;

  v_normalized := upper(btrim(p_new_code));

  IF v_normalized !~ '^[A-Z0-9]{6,8}$' THEN
    RAISE EXCEPTION 'El codigo debe tener entre 6 y 8 caracteres alfanumericos.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE access_code = v_normalized AND id != p_profile_id
  ) THEN
    RAISE EXCEPTION 'Este codigo ya esta asignado a otro perfil.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Perfil no encontrado.';
  END IF;

  UPDATE public.profiles
  SET access_code = v_normalized
  WHERE id = p_profile_id;
END;
$$;

COMMENT ON FUNCTION public.admin_upsert_access_code(uuid, text) IS
  'Asigna o edita la clave de acceso de un perfil. Valida formato y unicidad. Solo admins.';

-- 3. Auto-generar clave unica para un perfil
CREATE OR REPLACE FUNCTION public.admin_generate_access_code(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate text;
  v_attempts integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Perfil no encontrado.';
  END IF;

  LOOP
    v_candidate := public.generate_access_code(6);
    v_attempts := v_attempts + 1;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE access_code = v_candidate
    );

    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'No se pudo generar un codigo unico despues de 20 intentos.';
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET access_code = v_candidate
  WHERE id = p_profile_id;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.admin_generate_access_code(uuid) IS
  'Genera automaticamente un codigo de acceso unico de 6 caracteres y lo asigna al perfil indicado. Solo admins.';



-- SOURCE: 20260309_create_intro_classes_schema.sql

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



-- SOURCE: 20260309_update_finances_for_intro.sql

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



-- SOURCE: 20260310_095217_create_update_booking_session.sql

-- ============================================================================
-- RPC: update_booking_session
-- Fecha: 2026-03-10
-- Proposito: Permite cambiar la sesión (fecha/hora) de una reserva existente.
-- Reglas:
-- 1. La reserva debe existir, pertenecer a un alumno accesible o ser administrador.
-- 2. La reserva origen debe estar en estado 'reserved'.
-- 3. La sesión origen debe estar a > 12 horas (si el usuario no es admin).
-- 4. La sesión destino debe estar a futuro y con cupo disponible.
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_booking_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.update_booking_session(
  p_booking_id uuid,
  p_new_session_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_booking public.bookings;
  v_old_session public.sessions;
  v_new_session public.sessions;
  v_availability jsonb;
  v_is_admin boolean := false;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Comprobar si el actor es superadmin o admin
  SELECT role INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id;
  
  IF v_actor_role IN ('superadmin', 'admin') THEN
    v_is_admin := true;
  END IF;

  -- 1. Obtener la reserva original
  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF NOT v_is_admin AND NOT public.can_access_student(v_booking.student_id) THEN
    RAISE EXCEPTION 'No tienes acceso a modificar esta reserva';
  END IF;

  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes modificar reservas activas';
  END IF;

  -- 2. Obtener sesión origen y validar restricción de 12 horas
  SELECT *
  INTO v_old_session
  FROM public.sessions
  WHERE id = v_booking.session_id;

  IF v_old_session IS NULL THEN
    RAISE EXCEPTION 'Sesion original no encontrada';
  END IF;

  IF NOT v_is_admin THEN
    IF v_old_session.start_at <= now() THEN
      RAISE EXCEPTION 'La clase ya comenzo o finalizo';
    END IF;

    IF v_old_session.start_at < (now() + interval '12 hours') THEN
      RAISE EXCEPTION 'Solo puedes modificar una reserva con al menos 12 horas de anticipacion';
    END IF;
  END IF;

  -- 3. Obtener sesión destino y validar viabilidad
  SELECT *
  INTO v_new_session
  FROM public.sessions
  WHERE id = p_new_session_id
  FOR UPDATE;

  IF v_new_session IS NULL THEN
    RAISE EXCEPTION 'La nueva sesion no existe';
  END IF;

  IF v_new_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La nueva sesion no esta disponible';
  END IF;

  IF v_new_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reasignar la reserva a una clase pasada';
  END IF;

  IF p_new_session_id = v_booking.session_id THEN
    RAISE EXCEPTION 'La reserva ya esta asignada a esta sesion';
  END IF;

  -- 4. Validar colisión de reservas por este alumno
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_new_session_id
      AND b.student_id = v_booking.student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya tiene reservada esta nueva sesion';
  END IF;

  -- 5. Verificar cupo temporalmente liberando el espacio en la sesión origen
  -- La lógica real de cupos considera la tabla bindings, pero como estamos en
  -- la misma transacción, el update no se ha commiteado.
  -- Simplemente validamos la disponibilidad general de la sesión destino.
  v_availability := public.check_session_availability_v3(
    p_new_session_id,
    v_booking.student_id
  );

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  -- 6. Actualizar la reserva
  UPDATE public.bookings
  SET 
    session_id = p_new_session_id,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- No es necesario actualizar student_memberships ni student_credit_ledger 
  -- puesto que es un simple traslado (swapa un crédito de una sesión a otra).
  
  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_booking_session(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_booking_session(uuid, uuid) IS 
  'Cambia la sesión de una reserva a una nueva. Permite a los usuarios hacerlo >12h antes. Admins bypass.';



-- SOURCE: 20260310_174400_allow_cascading_membership_delete.sql

-- ============================================================================
-- Update: admin_delete_student_membership
-- Purpose: Allow deleting a membership along with all its associated bookings
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_delete_student_membership(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_student_membership(
  p_membership_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_membership public.student_memberships;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'Membresia no encontrada';
  END IF;

  -- 1. Eliminar reservas asociadas a esta membresia
  DELETE FROM public.bookings
  WHERE active_membership_id = p_membership_id;

  -- 2. Eliminar pagos de la membresia
  DELETE FROM public.student_membership_payments
  WHERE student_membership_id = p_membership_id;

  -- 3. Eliminar historial de creditos y movimientos de la membresia
  DELETE FROM public.student_credit_ledger
  WHERE student_membership_id = p_membership_id;

  -- 4. Eliminar la membresia
  DELETE FROM public.student_memberships
  WHERE id = p_membership_id;

  RETURN json_build_object(
    'success', true,
    'membership_id', p_membership_id,
    'message', 'Membresia y sus reservas eliminadas correctamente'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'membership_id', p_membership_id,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_student_membership(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_student_membership(uuid) IS
  'Elimina una membresia V2 y TODAS sus reservas asociadas en cascada. Borra tambien pagos y ledger derivados.';



-- SOURCE: 20260310_182500_fix_book_session_future_memberships.sql

-- ============================================================================
-- Fix: book_session for future memberships
-- Proposito: Permitir a los alumnos con membresias futuras reservar clases
-- siempre y cuando la sesion ocurra dentro del periodo de la membresia.
-- ============================================================================

DROP FUNCTION IF EXISTS public.book_session(uuid);
DROP FUNCTION IF EXISTS public.book_session(uuid, uuid);

CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  -- 1. Primero, obtener la sesion para saber la fecha
  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  -- 2. Buscar membresia activa *que aplique para la fecha de la sesion*
  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  -- 3. Otras verificaciones
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(
    p_session,
    v_student_id
  );

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    v_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    'Reserva realizada desde la app',
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion para el alumno, descontando el credito de la membresia activa que cobra vigencia el dia de la clase.';

-- ============================================================================
-- Fix: admin_book_session for future memberships
-- Proposito: Permitir a los administradores reservar clases para alumnos 
-- con membresias futuras.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_balance_after integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false THEN
    RAISE EXCEPTION 'El alumno esta inactivo';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'UTC')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'UTC')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(
      p_session_id,
      p_student_id
    );

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  UPDATE public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership.id
  RETURNING classes_remaining INTO v_balance_after;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    booking_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership.id,
    v_booking.id,
    'booking_reserved',
    -1,
    v_balance_after,
    CASE
      WHEN p_force THEN 'Reserva forzada desde admin'
      ELSE 'Reserva realizada desde admin'
    END,
    v_actor_id,
    now()
  );

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) IS
  'Reserva una sesion para cualquier alumno desde admin descontando el credito de la membresia aplicable en la fecha de la sesion. Puede forzar la reserva si p_force = true.';




-- SOURCE: 20260310_delete_session_rpc.sql

-- ============================================================================
-- RPC: admin_delete_session
-- Fecha: 2026-03-10
-- Proposito: Permite a un administrador eliminar un turno por completo y sus reservas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_delete_session(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_session(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_is_admin boolean := false;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Comprobar si el actor es superadmin o admin
  SELECT role INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id;
  
  IF v_actor_role IN ('superadmin', 'admin') THEN
    v_is_admin := true;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No tienes permisos para eliminar turnos';
  END IF;

  -- Primero, eliminar cualquier relacion (cascada manual si el ON DELETE CASCADE no está configurado)
  DELETE FROM public.session_distance_allocations WHERE session_id = p_session_id;
  DELETE FROM public.bookings WHERE session_id = p_session_id;
  DELETE FROM public.sessions WHERE id = p_session_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_session(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_session(uuid) IS 
  'Elimina un turno completamente, incluyendo sus cupos (distance_allocations) y reservas. Solo para admins.';



-- SOURCE: 20260311_091500_fix_booking_constraint.sql

-- ============================================================================
-- Fix: Booking Unique Constraint
-- Proposito: Remover el constraint ux_bookings_user_session_active que usa
-- user_id (perfil) e impide que un tutor reserve para multiples hijos en la
-- misma sesion, y reemplazarlo por un constraint que use student_id.
-- ============================================================================

-- Remover restricciones previas si existen como constraint y no solo indice
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS ux_bookings_user_session_active;

-- Remover el indice unico basado en user_id
DROP INDEX IF EXISTS ux_bookings_user_session_active;

-- Asegurar que tampoco exista el nuevo si estamos re-aplicando
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS ux_bookings_student_session_active;

DROP INDEX IF EXISTS ux_bookings_student_session_active;

-- Crear el nuevo indice unico basado en student_id que es la entidad correcta
CREATE UNIQUE INDEX ux_bookings_student_session_active
  ON public.bookings (student_id, session_id)
  WHERE status = 'reserved';

COMMENT ON INDEX ux_bookings_student_session_active IS
  'Evita que un mismo alumno tenga multiples reservas activas para el mismo turno.';


