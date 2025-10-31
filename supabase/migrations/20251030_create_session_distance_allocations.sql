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
