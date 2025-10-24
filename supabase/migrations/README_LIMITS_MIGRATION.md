# Migración: Sistema de Límites por Distancia y Grupo

## 📋 ¿Qué hace esta migración?

Implementa el sistema de validación de cupos para reservas de clases que considera:

1. **Límite por distancia**: Cada sesión define cuántas pacas hay por distancia (10m, 15m, 20m, 30m, 40m, 50m, 60m, 70m). Cada paca tiene 4 cupos.
2. **Límite por grupo**: Cada sesión define cuántos cupos hay para cada grupo (Niños, Jóvenes, Adultos, Asignados, Arco propio).

Cuando un alumno intenta reservar, el sistema valida ambos límites:
- ✅ Debe haber cupos disponibles en su distancia
- ✅ Debe haber cupos disponibles para su grupo

Si alguno de los dos está lleno, muestra el mensaje apropiado.

---

## 🚀 Instrucciones de Ejecución

### 1. Abrir Supabase SQL Editor

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard)
2. Click en **SQL Editor** en el menú lateral

### 2. Ejecutar migraciones EN ORDEN

**IMPORTANTE**: Debes ejecutar los scripts en este orden exacto.

#### Script 1: `20251023_add_booking_limits_simplified.sql`

```sql
-- Copiar y pegar TODO el contenido del archivo
-- Este script agrega:
-- - Columnas distance_m y group_type a profiles y bookings
-- - Función check_session_availability_v2() para validar cupos
```

**Resultado esperado**: ✅ Query executed successfully

---

#### Script 2: `20251023_update_book_session.sql`

```sql
-- Copiar y pegar TODO el contenido del archivo
-- Actualiza book_session() para usuarios regulares
```

**Resultado esperado**: ✅ Query executed successfully

---

#### Script 3: `20251023_update_admin_book_session.sql`

```sql
-- Copiar y pegar TODO el contenido del archivo
-- Actualiza admin_book_session() para admins
```

**Resultado esperado**: ✅ Query executed successfully

---

#### Script 4: `create_admin_cancel_booking.sql`

```sql
-- Copiar y pegar TODO el contenido del archivo
-- Función para cancelar reservas desde el admin
```

**Resultado esperado**: ✅ Query executed successfully

---

#### Script 5: `create_admin_roster_by_distance.sql`

```sql
-- Copiar y pegar TODO el contenido del archivo
-- Vista para mostrar cupos ocupados por distancia
```

**Resultado esperado**: ✅ Query executed successfully

---

## ✅ Verificación

Después de ejecutar todos los scripts, verifica:

### 1. Columnas agregadas

Ejecuta este query para verificar:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('distance_m', 'group_type');

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
  AND column_name IN ('distance_m', 'group_type');
```

Deberías ver 4 filas en total (2 por tabla).

### 2. Funciones creadas

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN (
  'check_session_availability_v2',
  'book_session',
  'admin_book_session',
  'admin_cancel_booking'
);
```

Deberías ver las 4 funciones.

### 3. Vista creada

```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_name = 'admin_roster_by_distance';
```

Debería aparecer la vista.

---

## 📝 Próximos Pasos

Después de ejecutar las migraciones:

1. **Actualizar perfiles de alumnos** - Ir a cada alumno y configurar:
   - Distancia de tiro (10m, 15m, 20m, 30m, 40m, 50m, 60m, 70m)
   - Grupo (children, youth, adult, assigned, ownbow)

2. **Crear/editar sesiones** - Al crear turnos, configurar:
   - Cupos por grupo (Niños, Jóvenes, Adultos, etc.)
   - Pacas por distancia (cuántas pacas de 4 cupos hay en cada distancia)

3. **Probar reservas** - Intentar reservar y verificar que:
   - Se validan los límites por distancia
   - Se validan los límites por grupo
   - Aparecen los mensajes de error correctos cuando está lleno

---

## 🔧 Solución de Problemas

### Error: "column already exists"

Si ves este error, significa que la columna ya fue agregada. Puedes ignorarlo, el script usa `IF NOT EXISTS` para evitar errores.

### Error: "function does not exist"

Asegúrate de ejecutar los scripts en el orden correcto. El script 2 y 3 dependen del script 1.

### Error: "permission denied"

Verifica que estás conectado como usuario con permisos de administrador en Supabase.

---

## 📚 Archivos Relacionados

- `supabase/migrations/20251023_add_booking_limits_simplified.sql`
- `supabase/migrations/20251023_update_book_session.sql`
- `supabase/migrations/20251023_update_admin_book_session.sql`
- `supabase/migrations/create_admin_cancel_booking.sql`
- `supabase/migrations/create_admin_roster_by_distance.sql`

---

## 💡 Distancias Disponibles

El sistema soporta las siguientes distancias:

- 10 metros
- 15 metros
- 20 metros
- 30 metros
- 40 metros
- 50 metros
- 60 metros
- 70 metros
