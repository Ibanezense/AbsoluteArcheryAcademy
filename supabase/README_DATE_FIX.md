# 🐛 Fix: Problema de Fechas que Cambian de Día

## Problema
Al agregar o editar membresías con fechas específicas (ej: inicio hoy, fin 23 nov), al guardar las fechas se restan/suman un día.

**Ejemplo:**
- Input: `2025-10-23` → `2025-11-23`
- Guardado: `2025-10-22` → `2025-11-22`

## Causa Raíz
Las funciones RPC de Supabase (`admin_add_membership` y `admin_update_profile_membership`) tienen los parámetros de fecha definidos como `TEXT` en lugar de `DATE`.

Cuando PostgreSQL recibe un string de fecha y lo convierte implícitamente a tipo `date`, lo interpreta como timestamp UTC, causando conversión de zona horaria que puede restar o sumar un día.

## Solución

### Paso 1: Ejecutar el Script SQL
1. Abre el **SQL Editor** en tu dashboard de Supabase
2. Abre el archivo `fix_membership_dates.sql`
3. Copia todo su contenido
4. Pégalo en el editor SQL de Supabase
5. Haz clic en **Run** para ejecutar

### Paso 2: Verificar
Después de ejecutar el script:
1. Intenta agregar una nueva membresía con fechas específicas
2. Verifica que las fechas se guarden correctamente sin cambio de día
3. Intenta editar una membresía existente
4. Verifica que las fechas actualizadas sean correctas

## Cambios Técnicos

### Antes (❌ Incorrecto)
```sql
CREATE OR REPLACE FUNCTION admin_add_membership(
  ...
  p_start text,  -- ❌ Tipo TEXT causa conversión de timezone
  p_end text,    -- ❌ Tipo TEXT causa conversión de timezone
  ...
)
```

### Después (✅ Correcto)
```sql
CREATE OR REPLACE FUNCTION admin_add_membership(
  ...
  p_start date,  -- ✅ Tipo DATE previene conversión
  p_end date,    -- ✅ Tipo DATE previene conversión
  ...
)
```

## Funciones Corregidas
- ✅ `admin_add_membership` - Agregar membresía a perfil
- ✅ `admin_update_profile_membership` - Actualizar membresía existente

## Notas Adicionales
- Los inputs `type="date"` en el frontend ya envían fechas en formato `YYYY-MM-DD`
- No se requieren cambios en el código del frontend
- Las columnas en la tabla siguen siendo tipo `date` (no cambian)
- Solo las funciones RPC necesitan actualizarse

## Testing
Después de aplicar el fix, prueba:
1. ✅ Crear membresía con fecha de hoy
2. ✅ Crear membresía con fecha futura (ej: +30 días)
3. ✅ Editar fecha de inicio de membresía existente
4. ✅ Editar fecha de fin de membresía existente
5. ✅ Verificar que las fechas en el perfil principal también se actualicen correctamente

## Soporte
Si después de aplicar el fix el problema persiste:
1. Verifica que las funciones se hayan actualizado ejecutando:
   ```sql
   SELECT proname, proargtypes 
   FROM pg_proc 
   WHERE proname LIKE 'admin_%membership%';
   ```
2. Revisa los logs de PostgreSQL en Supabase para errores
3. Verifica que no haya triggers que modifiquen las fechas
