# Pasos para Completar la Configuración del Sistema de Reservas

## Problema Actual

1. **Ocupación muestra 0%**: Las reservas existentes no tienen `distance_m` configurada, por lo que la vista no las cuenta
2. **Selector muestra "6 cupos"**: Los estudiantes no tienen `distance_m` ni `group_type` configurados en su perfil

## Solución Paso a Paso

### 1. Ejecutar Migraciones SQL en Supabase ✅ (Ya ejecutadas)

Ya ejecutaste estas migraciones:
- ✅ `20251023_add_booking_limits_simplified.sql`
- ✅ `20251023_update_book_session.sql`
- ✅ `20251023_update_admin_book_session.sql`
- ✅ `create_admin_cancel_booking.sql`
- ✅ `create_admin_roster_by_distance.sql`

### 2. Configurar Estudiantes (HACER AHORA)

Necesitas configurar `distance_m` y `group_type` para cada estudiante:

**Pasos:**
1. Ve a **Admin → Alumnos**
2. Para cada estudiante activo:
   - Haz clic en "Editar"
   - Selecciona su **Grupo** (Niños, Jóvenes, Adultos, etc.)
   - Selecciona su **Distancia de práctica** (10m, 15m, 20m, etc.)
   - Guarda cambios

**Ejemplo:**
- Bryan Dariel García Ramos:
  - Grupo: Adultos
  - Distancia: 20m (o la que normalmente use)
- Fabian Ibanez:
  - Grupo: Adultos
  - Distancia: 20m (o la que normalmente use)

### 3. Actualizar Reservas Existentes (DESPUÉS de configurar estudiantes)

Una vez que todos los estudiantes tengan `distance_m` y `group_type`:

1. Abre el **SQL Editor de Supabase**
2. Copia y pega el archivo `supabase/migrations/fix_existing_bookings.sql`
3. Ejecuta **SOLO la primera sección** (las queries SELECT) para ver diagnóstico
4. Si todo se ve bien, ejecuta el **UPDATE** para corregir las reservas

```sql
-- Esta query copiará la distancia y grupo del perfil a las reservas existentes
UPDATE bookings
SET 
  distance_m = p.distance_m,
  group_type = p.group_type
FROM profiles p
WHERE bookings.user_id = p.id
  AND bookings.status = 'reserved'
  AND (bookings.distance_m IS NULL OR bookings.group_type IS NULL)
  AND p.distance_m IS NOT NULL
  AND p.group_type IS NOT NULL;
```

### 4. Verificar que Todo Funciona

Después de completar los pasos anteriores:

1. **Panel de Control**:
   - La ocupación debería mostrar el porcentaje correcto (ej: 6% o 2/32)
   
2. **Reserva Rápida**:
   - Al seleccionar estudiante y fecha, el selector debe mostrar:
     - `16:00 - 17:30 • 10m (4), 20m (2), 30m (4)` (ejemplo)
     - Los números indican cupos disponibles por distancia
   
3. **Crear Nueva Reserva**:
   - Selecciona un estudiante (con distance_m configurada)
   - Selecciona fecha
   - Selecciona turno
   - Al reservar, la función validará:
     - Que hay cupos disponibles en esa distancia
     - Que hay cupos disponibles para ese grupo

## Cambios Realizados en el Código

### 1. `lib/adminBookingQueries.ts`
- ✅ `useAvailableSessions()` ahora consulta `session_distance_allocations`
- ✅ Calcula cupos por distancia (targets * 4)
- ✅ Cuenta reservas por sesión Y distancia
- ✅ Devuelve múltiples "sesiones" (una por cada distancia disponible)

### 2. `components/AdminQuickBooking.tsx`
- ✅ Agrupa sesiones por horario
- ✅ Muestra todas las distancias disponibles para cada turno
- ✅ Formato: `16:00 - 17:30 • 10m (4), 20m (2)` 

### 3. `app/admin/alumnos/editar/[id]/page.tsx`
- ✅ Agregado campo **Distancia de práctica** en formulario
- ✅ Dropdown con distancias: 10m, 15m, 20m, 30m, 40m, 50m, 60m, 70m
- ✅ Se guarda en `profiles.distance_m`

### 4. `supabase/migrations/create_admin_roster_by_distance.sql`
- ✅ Vista actualizada para usar `session_distance_allocations`
- ✅ Cuenta reservas por distancia correctamente
- ✅ JOIN con allocations de cada sesión

### 5. Nuevos archivos
- ✅ `fix_existing_bookings.sql` - Script para corregir reservas antiguas

## Notas Importantes

- **No podrás reservar** para estudiantes sin `distance_m` y `group_type` configurados
- Las funciones SQL (`book_session`, `admin_book_session`) validarán estos campos
- Si intentas reservar sin configurar, verás error: "Configura tu distancia de práctica en tu perfil"
- El sistema ahora valida DOS límites:
  1. **Límite por distancia**: 4 alumnos por paca (lanes × 4)
  2. **Límite por grupo**: Equipamiento disponible (ej: solo 2 arcos para niños)

## Próximos Pasos

1. ✅ Ejecutar migraciones SQL (COMPLETADO)
2. ⏳ Configurar `distance_m` y `group_type` para cada estudiante (PENDIENTE)
3. ⏳ Ejecutar `fix_existing_bookings.sql` UPDATE (DESPUÉS de #2)
4. ⏳ Verificar que la ocupación se muestra correctamente
5. ⏳ Probar crear nuevas reservas

¿Necesitas ayuda con algún paso?
