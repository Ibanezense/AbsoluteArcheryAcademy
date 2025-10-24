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
    AND group_type = p_group_type;

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
