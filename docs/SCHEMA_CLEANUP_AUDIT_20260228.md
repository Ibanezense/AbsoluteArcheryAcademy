# Schema Cleanup Audit

Fecha: 2026-02-28

## Objetivo

Separar las tablas en tres grupos:

- nucleo V2 que debe quedarse
- legacy que todavia no conviene borrar
- candidatas reales a limpieza

Esta auditoria se basa en:

- el esquema actual compartido
- referencias encontradas en `app/`, `components/`, `lib/` y `supabase/`
- el modelo V2 definido para `profiles -> students -> student_guardians`

## 1. Tablas nucleo V2

Estas forman parte del modelo actual y no deben tocarse:

- `profiles`
- `students`
- `student_guardians`
- `membership_plans`
- `student_memberships`
- `student_membership_payments`
- `student_credit_ledger`
- `bookings`
- `sessions`
- `session_distance_allocations`
- `bow_inventory`
- `weekly_session_templates`
- `weekly_session_template_distances`

## 2. Tablas legacy que todavia no conviene borrar

### `memberships`

Todavia tiene uso real en frontend:

- `app/admin/membresias/page.tsx`
- `lib/hooks/useMembershipTypes.ts`

Mientras esa pantalla siga operando sobre `memberships`, no conviene eliminarla.
Debe migrarse primero a `membership_plans`.

### `profile_memberships`

Ya no aparece como fuente directa en frontend, pero sigue siendo tabla puente de migracion:

- backfill hacia `student_memberships`
- compatibilidad historica con datos legacy

No conviene borrarla hasta que:

- toda la UI use `student_memberships`
- se valide que la migracion historica esta completa
- ya no existan funciones SQL que lean esa tabla

### `attendance_audit`

No la usa el frontend directamente, pero sigue formando parte de la logica de asistencia:

- `app/admin/asistencia/page.tsx` usa `admin_mark_attendance`
- `supabase/migrations/20251105_create_admin_mark_attendance.sql` escribe en `attendance_audit`

Si se quiere eliminar, antes hay que reemplazar o retirar la auditoria de asistencia.

### Columnas legacy dentro de `profiles`

No son tablas aparte, pero tambien requieren limpieza posterior:

- `membership_type`
- `classes_remaining`
- `membership_start`
- `membership_end`
- `group_type`
- `distance_m`
- `birth_date`
- `age`
- `shooting_distance`

No deben ser la fuente de verdad, pero aun conviene mantenerlas hasta terminar la migracion visual y de RPCs.

## 3. Tablas candidatas fuertes a limpieza

Estas no muestran uso real en `app/`, `components/`, `lib/` ni dependencia clara del flujo V2 actual.
Son las mejores candidatas para una limpieza fase 1, previo backup.

- `academy_profile`
- `admin_users`
- `app_settings`
- `badges`
- `coach_notes`
- `matches_eliminations`
- `payment_transactions`
- `personal_records`
- `ranking_history`
- `scores_qualifications`
- `season_statistics`
- `tournament_participations`
- `tournament_results`
- `tournaments`
- `training_sessions`

## 4. Tablas legacy de infraestructura que parecen reemplazadas

Estas nacen del modelo anterior de infraestructura y hoy compiten con el modelo nuevo:

- `equipment`
- `shooting_lanes`
- `locations`

Observacion:

- el modelo actual de reservas ya se esta moviendo a `bow_inventory` + `session_distance_allocations`
- no encontre lecturas directas de estas tablas en el frontend actual
- su presencia agrega ruido conceptual y riesgo de mantener dos verdades

No las borraria sin antes validar que:

- no hay datos operativos que quieras conservar
- ninguna pantalla admin pendiente dependa de ellas
- no existen funciones SQL en produccion que aun las consulten

## 5. Riesgos actuales del esquema mixto

El problema principal no es solo tener muchas tablas, sino tener varias fuentes de verdad:

- `memberships` y `membership_plans`
- `profile_memberships` y `student_memberships`
- `equipment` y `bow_inventory`
- cupos legacy en `sessions.capacity_*` y cupos V2 en `session_distance_allocations`
- datos de alumno mezclados entre `profiles` y `students`

Ese estado mixto aumenta la probabilidad de:

- guardar en una tabla que ya no deberia usarse
- leer datos desactualizados
- mantener rutas API con ramas legacy fragiles

## 6. Orden recomendado de limpieza

### Fase 1

Limpiar tablas claramente muertas, previa exportacion:

- `academy_profile`
- `admin_users`
- `app_settings`
- `badges`
- `coach_notes`
- `matches_eliminations`
- `payment_transactions`
- `personal_records`
- `ranking_history`
- `scores_qualifications`
- `season_statistics`
- `tournament_participations`
- `tournament_results`
- `tournaments`
- `training_sessions`

### Fase 2

Migrar completamente la UI y admin:

- `memberships` -> `membership_plans`
- `profile_memberships` -> `student_memberships`
- `profiles` como cuenta, no como alumno

### Fase 3

Eliminar infraestructura legacy:

- `equipment`
- `shooting_lanes`
- `locations`
- columnas `capacity_*` en `sessions`

### Fase 4

Eliminar columnas legacy de `profiles` y compatibilidad vieja en `bookings.user_id`, si ya no queda ningun flujo que dependa de ellas.

## 7. Recomendacion practica

No haria un `DROP` masivo ahora.

Haria primero dos entregables:

1. una migracion de limpieza fase 1 solo para tablas muertas
2. una migracion aparte para retirar legacy de membresias e infraestructura cuando la UI ya no las use

La prioridad real es reducir las dobles fuentes de verdad, no solo bajar el numero de tablas.
