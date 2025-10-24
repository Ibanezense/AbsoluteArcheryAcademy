-- =====================================================
-- MIGRACIÓN: ARREGLAR ESQUEMA DE INFRAESTRUCTURA
-- Fecha: 2025-10-08
-- Propósito: Corregir problemas de migración y crear tablas de infraestructura
-- =====================================================

-- Primero, verificar y corregir la tabla memberships si es necesario
DO $$ 
BEGIN
    -- Solo crear la tabla si no existe
    IF NOT EXISTS (SELECT FROM information_schema.tables 
                  WHERE table_schema = 'public' AND table_name = 'memberships') THEN
        CREATE TABLE memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            start_date TIMESTAMPTZ NOT NULL,
            end_date TIMESTAMPTZ NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            type TEXT NOT NULL,
            normal_credits INTEGER DEFAULT 0,
            recovery_credits INTEGER DEFAULT 0,
            recovery_credits_expiry_date TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    END IF;

    -- Agregar columna student_id si no existe
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                  WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'student_id') THEN
        ALTER TABLE memberships ADD COLUMN student_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Crear índices si no existen
CREATE INDEX IF NOT EXISTS idx_memberships_student_id ON memberships(student_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

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

-- Índices para las nuevas tablas
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_available ON equipment(available_quantity);
CREATE INDEX IF NOT EXISTS idx_shooting_lanes_distance ON shooting_lanes(distance_meters);
CREATE INDEX IF NOT EXISTS idx_shooting_lanes_active ON shooting_lanes(is_active);

-- Políticas RLS para equipment
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view equipment"
    ON equipment FOR SELECT
    USING (true);

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

CREATE POLICY "Everyone can view shooting lanes"
    ON shooting_lanes FOR SELECT
    USING (true);

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

-- Función para actualizar available_quantity cuando cambie total_quantity
CREATE OR REPLACE FUNCTION update_equipment_availability()
RETURNS TRIGGER AS $$
BEGIN
    -- Si se actualiza la cantidad total, ajustar la disponible proporcionalmente
    IF TG_OP = 'UPDATE' AND OLD.total_quantity != NEW.total_quantity THEN
        -- Si aumenta la cantidad total, aumentar la disponible
        IF NEW.total_quantity > OLD.total_quantity THEN
            NEW.available_quantity = NEW.available_quantity + (NEW.total_quantity - OLD.total_quantity);
        -- Si disminuye la cantidad total, asegurar que no sea negativa la disponible
        ELSE
            NEW.available_quantity = LEAST(NEW.available_quantity, NEW.total_quantity);
        END IF;
    END IF;
    
    -- En INSERT, available_quantity = total_quantity por defecto
    IF TG_OP = 'INSERT' AND NEW.available_quantity IS NULL THEN
        NEW.available_quantity = NEW.total_quantity;
    END IF;
    
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para equipment
DROP TRIGGER IF EXISTS equipment_availability_trigger ON equipment;
CREATE TRIGGER equipment_availability_trigger
    BEFORE INSERT OR UPDATE ON equipment
    FOR EACH ROW EXECUTE FUNCTION update_equipment_availability();

-- Función para actualizar updated_at en shooting_lanes
CREATE OR REPLACE FUNCTION update_shooting_lanes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para shooting_lanes
DROP TRIGGER IF EXISTS shooting_lanes_timestamp_trigger ON shooting_lanes;
CREATE TRIGGER shooting_lanes_timestamp_trigger
    BEFORE UPDATE ON shooting_lanes
    FOR EACH ROW EXECUTE FUNCTION update_shooting_lanes_timestamp();

-- Insertar datos de ejemplo para equipamiento
INSERT INTO equipment (name, category, total_quantity, available_quantity, description) VALUES
('Arco Infantil Recurvo', 'niños', 10, 10, 'Arcos de iniciación para niños de 6-12 años'),
('Arco Juvenil Compuesto', 'jovenes', 8, 8, 'Arcos compuestos para jóvenes de 13-17 años'),
('Arco Adulto Recurvo', 'adultos', 15, 15, 'Arcos recurvos para adultos principiantes y avanzados'),
('Protector Brazo', 'universal', 25, 25, 'Protectores de brazo universales'),
('Guante de Tiro', 'universal', 20, 20, 'Guantes de protección para la cuerda')
ON CONFLICT DO NOTHING;

-- Insertar datos de ejemplo para pistas
INSERT INTO shooting_lanes (name, distance_meters, max_capacity, description) VALUES
('Pista Principal A', 18, 6, 'Pista principal para competencias y entrenamiento avanzado'),
('Pista Principal B', 18, 6, 'Pista secundaria para competencias'),
('Pista Iniciación 1', 10, 4, 'Pista para principiantes y niños'),
('Pista Iniciación 2', 10, 4, 'Pista para principiantes y práctica'),
('Pista Intermedia', 15, 5, 'Pista para nivel intermedio')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions
GRANT ALL ON equipment TO authenticated;
GRANT ALL ON shooting_lanes TO authenticated;

-- =====================================================
-- FIN DE LA MIGRACIÓN - INFRAESTRUCTURA COMPLETA
-- =====================================================