-- Crear tabla de equipamiento
CREATE TABLE IF NOT EXISTS public.equipment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('niños', 'jovenes', 'adultos', 'asignados')),
    total_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
    available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT available_quantity_check CHECK (available_quantity <= total_quantity)
);

-- Crear tabla de pistas de tiro
CREATE TABLE IF NOT EXISTS public.shooting_lanes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    distance_meters INTEGER NOT NULL CHECK (distance_meters > 0),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shooting_lanes_updated_at BEFORE UPDATE ON public.shooting_lanes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shooting_lanes ENABLE ROW LEVEL SECURITY;

-- Política para equipment - solo admins pueden ver y modificar
CREATE POLICY "Admins can manage equipment" ON public.equipment
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Política para shooting_lanes - solo admins pueden ver y modificar
CREATE POLICY "Admins can manage shooting lanes" ON public.shooting_lanes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Insertar datos de ejemplo
INSERT INTO public.equipment (name, category, total_quantity, available_quantity) VALUES
    ('Arco Infantil Recurvo', 'niños', 5, 5),
    ('Arco Juvenil Compuesto', 'jovenes', 8, 8),
    ('Arco Adulto Recurvo', 'adultos', 10, 10),
    ('Arco de Competición', 'asignados', 3, 3);

INSERT INTO public.shooting_lanes (name, distance_meters, capacity) VALUES
    ('Pista Corta', 10, 4),
    ('Pista Mediana', 25, 4),
    ('Pista Larga', 50, 6);