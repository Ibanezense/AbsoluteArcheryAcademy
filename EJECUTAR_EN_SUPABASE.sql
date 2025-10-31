-- ====================================================================
-- SCRIPT DE CORRECCIÓN PARA EJECUTAR EN SUPABASE SQL EDITOR
-- ====================================================================
-- Este script corrige los siguientes errores:
-- 1. "operator does not exist: group_type = text" 
--    - Agrega conversiones explícitas (::text) donde se compara group_type
-- 2. "new row for relation 'session_distance_allocations' violates check constraint"
--    - Crea la tabla session_distance_allocations que faltaba
-- ====================================================================
-- INSTRUCCIONES:
-- 1. Abre Supabase Dashboard → SQL Editor
-- 2. Copia y pega TODO este archivo
-- 3. Haz clic en "Run" o presiona Ctrl+Enter
-- 4. Verifica que no haya errores
-- ====================================================================

-- ====================================================================
-- 0. CREAR TABLA session_distance_allocations (SI NO EXISTE)
-- ====================================================================
-- Esta tabla almacena qué distancias están disponibles en cada sesión
-- y cuántas pacas (targets) se asignan a cada distancia
-- ====================================================================

CREATE TABLE IF NOT EXISTS session_distance_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  distance_m INTEGER NOT NULL CHECK (distance_m IN (10, 15, 20, 30, 40, 50, 60, 70)),
  targets INTEGER NOT NULL DEFAULT 0 CHECK (targets >= 0 AND targets <= 8),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, distance_m)
);

CREATE INDEX IF NOT EXISTS idx_session_distance_allocations_session_id 
ON session_distance_allocations(session_id);

-- 0.b RECONFIGURAR CONSTRAINTS (asegurar distancias válidas y targets 0..8)
-- Nota: si la tabla ya existía con otro CHECK, lo eliminamos y volvemos a crearlo
DO $$
DECLARE r RECORD;
BEGIN
  -- Quitar cualquier CHECK que afecte a distance_m
  FOR r IN 
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'session_distance_allocations'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%distance_m%'
  LOOP
    EXECUTE format('ALTER TABLE public.session_distance_allocations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  -- Quitar cualquier CHECK que afecte a targets
  FOR r IN 
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'session_distance_allocations'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%targets%'
  LOOP
    EXECUTE format('ALTER TABLE public.session_distance_allocations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 0.c ASEGURAR COLUMNAS DE CAPACIDAD POR GRUPO EN SESSIONS
-- Algunas instalaciones tienen una única columna "capacity" en lugar de las desglosadas.
-- Este bloque agrega las columnas nuevas si faltan y, si existe la antigua, migra su valor a capacity_adult.
DO $$
BEGIN
  -- Agregar columnas si no existen
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='sessions' AND column_name='capacity_children'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN capacity_children integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='sessions' AND column_name='capacity_youth'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN capacity_youth integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='sessions' AND column_name='capacity_adult'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN capacity_adult integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='sessions' AND column_name='capacity_assigned'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN capacity_assigned integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='sessions' AND column_name='capacity_ownbow'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN capacity_ownbow integer DEFAULT 0;
  END IF;

  -- Migrar valor de la columna legacy "capacity" si existe, solo cuando las nuevas estén en cero
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='sessions' AND column_name='capacity'
  ) THEN
    UPDATE public.sessions
    SET capacity_adult = COALESCE(NULLIF(capacity_adult, 0), capacity)
    WHERE capacity IS NOT NULL;
  END IF;
END $$;

-- Limpiar filas que violen los nuevos checks antes de crearlos
-- 1) Eliminar asignaciones con distancias no permitidas
DELETE FROM public.session_distance_allocations
WHERE distance_m NOT IN (10, 15, 20, 30, 40, 50, 60, 70);

-- 2) Normalizar targets fuera de rango
UPDATE public.session_distance_allocations
SET targets = LEAST(GREATEST(targets, 0), 8)
WHERE targets < 0 OR targets > 8;

-- Crear los CHECK definitivos (idempotente)
ALTER TABLE public.session_distance_allocations DROP CONSTRAINT IF EXISTS session_distance_allocations_distance_m_check;
ALTER TABLE public.session_distance_allocations ADD CONSTRAINT session_distance_allocations_distance_m_check
  CHECK (distance_m IN (10, 15, 20, 30, 40, 50, 60, 70));

ALTER TABLE public.session_distance_allocations DROP CONSTRAINT IF EXISTS session_distance_allocations_targets_check;
ALTER TABLE public.session_distance_allocations ADD CONSTRAINT session_distance_allocations_targets_check
  CHECK (targets >= 0 AND targets <= 8);

ALTER TABLE session_distance_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view session distance allocations" ON session_distance_allocations;
CREATE POLICY "Anyone can view session distance allocations"
  ON session_distance_allocations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only admins can manage session distance allocations" ON session_distance_allocations;
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

-- ====================================================================
-- 1. RECREAR check_session_availability_v2 (CON FIX)
-- ====================================================================
DROP FUNCTION IF EXISTS public.check_session_availability_v2(uuid, integer, text);
DROP FUNCTION IF EXISTS public.check_session_availability_v2(uuid, integer, group_type);

CREATE OR REPLACE FUNCTION public.check_session_availability_v2(
  p_session_id uuid,
  p_distance_m integer,
  p_group_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session sessions;
  v_allocation session_distance_allocations;
  v_capacity_distance integer;
  v_reserved_distance integer;
  v_capacity_group integer;
  v_reserved_group integer;
  v_capacity_field text;
BEGIN
  -- Obtener la sesión
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'Sesión no encontrada');
  END IF;

  -- Verificar que existe la asignación para esta distancia
  SELECT * INTO v_allocation 
  FROM session_distance_allocations 
  WHERE session_id = p_session_id AND distance_m = p_distance_m;
  
  IF v_allocation IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'No hay asignación para esta distancia');
  END IF;

  -- VALIDACIÓN 1: Cupos por distancia (targets × 4 plazas)
  v_capacity_distance := v_allocation.targets * 4;
  
  SELECT COUNT(*) INTO v_reserved_distance
  FROM bookings
  WHERE session_id = p_session_id
    AND distance_m = p_distance_m
    AND status = 'reserved';

  IF v_reserved_distance >= v_capacity_distance THEN
    RETURN jsonb_build_object(
      'available', false, 
      'message', 'No hay cupos disponibles para esta distancia'
    );
  END IF;

  -- VALIDACIÓN 2: Cupos por grupo (excepto ownbow que solo valida distancia)
  IF p_group_type = 'ownbow' THEN
    -- Arco propio solo necesita validación por distancia
    RETURN jsonb_build_object('available', true, 'message', 'Cupo disponible');
  END IF;

  -- Obtener capacidad del grupo desde la sesión
  v_capacity_field := 'capacity_' || p_group_type;
  EXECUTE format('SELECT %I FROM sessions WHERE id = $1', v_capacity_field)
  INTO v_capacity_group
  USING p_session_id;

  IF v_capacity_group IS NULL THEN
    v_capacity_group := 0;
  END IF;

  -- Contar reservas para este grupo en esta sesión
  -- ⚠️ FIX: Agregar ::text para evitar error de operador
  SELECT COUNT(*) INTO v_reserved_group
  FROM bookings
  WHERE session_id = p_session_id
    AND group_type::text = p_group_type
    AND status = 'reserved';

  IF v_reserved_group >= v_capacity_group THEN
    RETURN jsonb_build_object(
      'available', false, 
      'message', 'No hay cupos disponibles para tu grupo (equipamiento completo)'
    );
  END IF;

  -- Todo OK
  RETURN jsonb_build_object('available', true, 'message', 'Cupo disponible');
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_session_availability_v2(uuid, integer, text) TO authenticated;

-- ====================================================================
-- 2. RECREAR book_session CON VALIDACIÓN DE MEMBRESÍA
-- ====================================================================
DROP FUNCTION IF EXISTS public.book_session(uuid);

CREATE OR REPLACE FUNCTION public.book_session(p_session uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_profile profiles;
  v_session sessions;
  v_booking bookings;
  v_availability jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Obtener perfil del usuario
  SELECT * INTO v_profile FROM profiles WHERE id = v_user;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  -- NUEVA VALIDACIÓN: Verificar que la membresía no esté vencida
  IF v_profile.membership_end IS NOT NULL AND v_profile.membership_end < CURRENT_DATE THEN
    RAISE EXCEPTION 'Tu membresía ha vencido. Por favor contacta al administrador para renovarla.';
  END IF;

  -- Validar que tenga clases disponibles
  IF COALESCE(v_profile.classes_remaining, 0) <= 0 THEN
    RAISE EXCEPTION 'No tienes clases disponibles';
  END IF;

  -- Validar que tenga distancia y grupo configurados
  IF v_profile.distance_m IS NULL THEN
    RAISE EXCEPTION 'Tu perfil no tiene configurada una distancia de tiro. Por favor contacta al administrador.';
  END IF;

  IF v_profile.group_type IS NULL THEN
    RAISE EXCEPTION 'Tu perfil no tiene configurado un grupo. Por favor contacta al administrador.';
  END IF;

  -- Obtener la sesión
  SELECT * INTO v_session FROM sessions WHERE id = p_session FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesión no está disponible';
  END IF;

  IF v_session.start_at <= NOW() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  -- Evitar doble reserva del mismo usuario en la misma sesión
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE session_id = p_session 
      AND user_id = v_user 
      AND status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'Ya reservaste esta sesión';
  END IF;

  -- VALIDAR DISPONIBILIDAD usando check_session_availability_v2 con prefijo public
  v_availability := public.check_session_availability_v2(
    p_session, 
    v_profile.distance_m, 
    v_profile.group_type::text
  );

  -- Si no hay cupos disponibles, lanzar excepción con el mensaje apropiado
  IF (v_availability->>'available')::boolean = FALSE THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  -- Crear la reserva con distancia y grupo
  INSERT INTO bookings(user_id, session_id, status, distance_m, group_type) 
  VALUES (v_user, p_session, 'reserved', v_profile.distance_m, v_profile.group_type)
  RETURNING * INTO v_booking;

  -- Descontar clase del perfil
  UPDATE profiles 
  SET classes_remaining = classes_remaining - 1 
  WHERE id = v_user;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid) TO authenticated;

-- ====================================================================
-- 3. RECREAR admin_book_session CON VALIDACIÓN DE MEMBRESÍA
-- ====================================================================
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_profile profiles;
  v_session sessions;
  v_availability jsonb;
BEGIN
  -- Verificar que es admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'No autorizado - Solo admins pueden hacer reservas';
  END IF;

  -- Obtener perfil del estudiante
  SELECT * INTO v_profile FROM profiles WHERE id = p_student_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Estudiante no encontrado';
  END IF;

  -- ADVERTENCIA: Si la membresía está vencida (pero el admin puede continuar)
  IF v_profile.membership_end IS NOT NULL AND v_profile.membership_end < CURRENT_DATE THEN
    RAISE NOTICE 'ADVERTENCIA: La membresía del estudiante está vencida desde %', v_profile.membership_end;
  END IF;

  -- Validar que tenga clases disponibles
  IF COALESCE(v_profile.classes_remaining, 0) <= 0 THEN
    RAISE EXCEPTION 'El estudiante no tiene clases disponibles';
  END IF;

  -- Validar configuración del perfil
  IF v_profile.distance_m IS NULL THEN
    RAISE EXCEPTION 'El estudiante no tiene configurada una distancia de tiro';
  END IF;

  IF v_profile.group_type IS NULL THEN
    RAISE EXCEPTION 'El estudiante no tiene configurado un grupo';
  END IF;

  -- Obtener la sesión
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesión no está disponible';
  END IF;

  -- Evitar doble reserva
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE session_id = p_session_id 
      AND user_id = p_student_id 
      AND status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El estudiante ya tiene una reserva en esta sesión';
  END IF;

  -- VALIDAR DISPONIBILIDAD usando check_session_availability_v2 con prefijo public
  v_availability := public.check_session_availability_v2(
    p_session_id, 
    v_profile.distance_m, 
    v_profile.group_type::text
  );

  IF (v_availability->>'available')::boolean = FALSE THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  -- Crear la reserva
  INSERT INTO bookings(user_id, session_id, status, distance_m, group_type) 
  VALUES (p_student_id, p_session_id, 'reserved', v_profile.distance_m, v_profile.group_type);

  -- Descontar clase
  UPDATE profiles 
  SET classes_remaining = classes_remaining - 1 
  WHERE id = p_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid) TO authenticated;

-- ====================================================================
-- VERIFICACIÓN
-- ====================================================================
-- Verifica que las funciones se crearon correctamente:
SELECT 
  routine_name, 
  routine_schema,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_name IN ('check_session_availability_v2', 'book_session', 'admin_book_session')
  AND routine_schema = 'public'
ORDER BY routine_name;

-- ====================================================================
-- ✅ LISTO
-- ====================================================================
-- Si ves las 3 funciones listadas arriba, todo está correcto.
-- Ahora puedes probar hacer una reserva desde la app.
-- ====================================================================
