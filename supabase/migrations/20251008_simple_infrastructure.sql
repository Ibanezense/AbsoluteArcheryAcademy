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