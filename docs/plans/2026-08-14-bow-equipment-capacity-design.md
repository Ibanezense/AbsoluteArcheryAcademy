# Diseño de capacidad por equipo de arquería

## Objetivo

Reemplazar el límite operativo basado en `4 cupos por paca` por un límite basado exclusivamente en equipo disponible. Los alumnos con arco propio o asignado no tendrán límite de capacidad por turno. Los alumnos con arco de academia compartirán seis arcos activos de 20 lb con las clases de prueba que excedan los dos arcos de prueba separados.

## Reglas aprobadas

- `own` (arco propio): puede reservar cualquier turno válido sin consumir inventario.
- `assigned` (arco asignado): puede reservar cualquier turno válido sin consumir inventario.
- `shared_inventory` (arco de academia): consume un arco del inventario activo de 20 lb.
- El inventario de academia se obtiene de `bow_inventory.quantity_active` para `draw_weight_lbs = 20` y se configura inicialmente en 6.
- Existen dos arcos de prueba separados y adicionales a los seis arcos de academia.
- Las primeras dos reservas de prueba de un turno usan los dos arcos de prueba.
- Desde la tercera reserva de prueba del mismo turno, cada prueba consume un arco de academia.
- Disponibilidad de academia por turno:

  `max(arcos_academia_activos - alumnos_academia_reservados - max(pruebas_reservadas - 2, 0), 0)`

- Las reservas canceladas no consumen equipo. Para disponibilidad futura se cuentan reservas con estado `reserved`; los estados de asistencia posteriores no deben bloquear nuevos turnos.
- Las pacas y asignaciones por distancia permanecen como información de infraestructura, pero no participan en la autorización de reservas.

## Arquitectura

Una función canónica de base de datos calculará el uso de equipo por turno. `check_session_availability_v3`, `get_available_sessions_for_student`, la reserva rápida administrativa y los RPC de clases de prueba reutilizarán la misma regla para evitar divergencias entre la pantalla y la escritura final.

La validación de escritura bloqueará la fila de `sessions` antes de volver a calcular capacidad. Esto serializa reservas concurrentes del mismo turno y evita que dos solicitudes consuman simultáneamente el último arco. Los RPC seguirán como `SECURITY DEFINER`, con `search_path` fijo, validación del actor y permisos revocados para `PUBLIC` y `anon`.

No se añadirá una tabla nueva: las clases de prueba ya se identifican mediante `bookings.intro_client_id IS NOT NULL`, y los alumnos de academia mediante `student_id IS NOT NULL` junto con `bow_usage_type = 'shared_inventory'`.

## Flujo de disponibilidad

1. La aplicación determina el tipo de arco del alumno.
2. Si es `own` o `assigned`, devuelve disponibilidad sin consultar pacas ni distancia.
3. Si es `shared_inventory`, carga el inventario activo de 20 lb.
4. Cuenta alumnos regulares reservados con equipo de academia.
5. Cuenta reservas de prueba y resta del inventario solo las que exceden dos.
6. Devuelve los arcos disponibles como `spots_for_student`.
7. Al confirmar una reserva, el RPC bloquea el turno y repite el cálculo antes del `INSERT`.

Las clases de prueba aplican el mismo cálculo: las dos primeras entran mientras exista uno de los dos equipos de prueba; las siguientes requieren saldo en el inventario de academia.

## Interfaz y errores

- Los turnos para arco propio o asignado mostrarán disponibilidad sin depender de `slot_capacity`.
- Los turnos para arco de academia mostrarán los equipos disponibles calculados.
- Cuando no quede equipo, el backend devolverá y la interfaz mostrará: `Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.`
- Las superficies administrativas dejarán de presentar el saldo como cupos derivados de pacas cuando se trate de reservas.
- El modo administrativo forzado conservará su comportamiento explícito, pero mostrará claramente que está excediendo el equipo disponible.

## Compatibilidad y datos

- Se mantendrán las columnas `targets` y `slot_capacity` para infraestructura y compatibilidad histórica.
- La migración establecerá en 6 la cantidad activa del inventario de 20 lb, sin reducir `quantity_total` si ya fuera mayor.
- Las reservas existentes conservarán `bow_usage_type`; la nueva regla contará las reservas actuales sin reescribir su historial.

## Pruebas y verificación

- Pruebas SQL estáticas para impedir que las funciones canónicas vuelvan a usar `slot_capacity`, `targets * 4` o conteo por distancia.
- Casos de capacidad: 0, 1 y 2 pruebas no consumen academia; 3 pruebas consumen 1; 8 pruebas consumen los 6 arcos.
- Casos combinados: alumnos de academia más excedente de pruebas nunca superan 6.
- Arco propio y asignado permanecen disponibles aunque no queden arcos de academia.
- Prueba de mensaje exacto cuando el equipo se agota.
- Prueba de bloqueo de turno antes del cálculo final para concurrencia.
- Verificación completa: tests, TypeScript, lint, build, ensayo transaccional de la migración, aplicación en Supabase y comprobaciones de producción en Vercel.
