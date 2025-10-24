-- ====================================================================
-- MIGRACIÓN: Sistema de infraestructura y límites por distancia/grupo
-- ====================================================================
-- Agrega las tablas y lógica necesaria para gestionar:
-- 1. Infraestructura: pacas disponibles por distancia
-- 2. Límites de equipamiento por grupo de edad
-- 3. Validación de cupos disponibles considerando ambos límites
-- ====================================================================

-- Tabla: Infraestructura de campo (pacas/líneas por distancia)
CREATE TABLE IF NOT EXISTS field_infrastructure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distance_m integer NOT NULL,
  lanes integer NOT NULL DEFAULT 8, -- número de pacas/líneas
  spots_per_lane integer NOT NULL DEFAULT 4, -- cupos por paca
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(distance_m)
);

-- Insertar configuración inicial (8 pacas x 4 cupos = 32 por distancia)
INSERT INTO field_infrastructure (distance_m, lanes, spots_per_lane) VALUES
  (10, 8, 4),
  (18, 8, 4),
  (30, 8, 4),
  (40, 8, 4),
  (50, 8, 4),
  (60, 8, 4),
  (70, 8, 4)
ON CONFLICT (distance_m) DO NOTHING;

-- Tabla: Equipamiento disponible por grupo
CREATE TABLE IF NOT EXISTS equipment_by_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type text NOT NULL, -- 'children', 'youth', 'adult'
  available_bows integer NOT NULL, -- arcos disponibles para este grupo
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(group_type)
);

-- Insertar configuración inicial de equipamiento
INSERT INTO equipment_by_group (group_type, available_bows, description) VALUES
  ('children', 2, 'Niños 8-12 años - 2 arcos disponibles'),
  ('youth', 4, 'Jóvenes 13-17 años - 4 arcos disponibles'),
  ('adult', 8, 'Adultos 18+ años - 8 arcos disponibles'),
  ('assigned', 32, 'Arcos asignados - sin límite específico'),
  ('ownbow', 32, 'Arco propio - sin límite específico')
ON CONFLICT (group_type) DO NOTHING;

-- Agregar columnas a la tabla profiles si no existen
DO $$ 
BEGIN
  -- Agregar columna distance_m (distancia de tiro del alumno)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='distance_m') THEN
    ALTER TABLE profiles ADD COLUMN distance_m integer DEFAULT 18;
  END IF;

  -- Agregar columna group_type (grupo de edad)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='group_type') THEN
    ALTER TABLE profiles ADD COLUMN group_type text DEFAULT 'adult'
      CHECK (group_type IN ('children', 'youth', 'adult', 'assigned', 'ownbow'));
  END IF;
END $$;

-- Agregar columnas a la tabla bookings si no existen
DO $$ 
BEGIN
  -- Almacenar la distancia y grupo en el momento de la reserva
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
CREATE OR REPLACE FUNCTION check_session_availability(
  p_session_id uuid,
  p_distance_m integer,
  p_group_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_infra field_infrastructure;
  v_equipment equipment_by_group;
  v_reserved_distance integer;
  v_reserved_group integer;
  v_total_capacity integer;
  v_available_distance integer;
  v_available_group integer;
  v_result jsonb;
BEGIN
  -- Obtener infraestructura para la distancia
  SELECT * INTO v_infra
  FROM field_infrastructure
  WHERE distance_m = p_distance_m;

  IF v_infra IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'distance_not_configured',
      'message', 'La distancia ' || p_distance_m || 'm no está configurada'
    );
  END IF;

  -- Obtener límite de equipamiento para el grupo
  SELECT * INTO v_equipment
  FROM equipment_by_group
  WHERE group_type = p_group_type;

  IF v_equipment IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'group_not_configured',
      'message', 'El grupo ' || p_group_type || ' no está configurado'
    );
  END IF;

  -- Contar reservas existentes para esta distancia en esta sesión
  SELECT COUNT(*) INTO v_reserved_distance
  FROM bookings
  WHERE session_id = p_session_id
    AND status = 'reserved'
    AND distance_m = p_distance_m;

  -- Contar reservas existentes para este grupo + distancia en esta sesión
  SELECT COUNT(*) INTO v_reserved_group
  FROM bookings
  WHERE session_id = p_session_id
    AND status = 'reserved'
    AND distance_m = p_distance_m
    AND group_type = p_group_type;

  -- Calcular capacidades
  v_total_capacity := v_infra.lanes * v_infra.spots_per_lane;
  v_available_distance := v_total_capacity - v_reserved_distance;
  v_available_group := v_equipment.available_bows - v_reserved_group;

  -- Verificar ambos límites
  IF v_available_distance <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'distance_full',
      'message', 'Turno lleno para ' || p_distance_m || 'm. Por favor selecciona otro turno.',
      'reserved_distance', v_reserved_distance,
      'capacity_distance', v_total_capacity
    );
  END IF;

  IF v_available_group <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'equipment_full',
      'message', 'No hay arcos disponibles para tu grupo en esta distancia. Por favor selecciona otro turno.',
      'reserved_group', v_reserved_group,
      'available_bows', v_equipment.available_bows
    );
  END IF;

  -- Hay cupos disponibles
  RETURN jsonb_build_object(
    'available', true,
    'available_distance', v_available_distance,
    'available_group', v_available_group,
    'reserved_distance', v_reserved_distance,
    'reserved_group', v_reserved_group,
    'capacity_distance', v_total_capacity,
    'available_bows', v_equipment.available_bows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_session_availability(uuid, integer, text) TO authenticated;

-- ====================================================================
-- INSTRUCCIONES:
-- ====================================================================
-- 1. Abre el editor SQL de Supabase (SQL Editor)
-- 2. Copia y pega este archivo completo
-- 3. Ejecuta el script
-- 4. Actualizar la función book_session para usar check_session_availability
-- ====================================================================
