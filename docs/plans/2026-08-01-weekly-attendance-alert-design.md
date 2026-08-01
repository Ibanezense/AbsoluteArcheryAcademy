# Alerta semanal de inasistencia — Diseño

## Objetivo

Los domingos, una vez resueltas las asistencias de todas las reservas comprendidas entre jueves y domingo, el panel de asistencia debe identificar a los alumnos con membresía activa o por vencer que no asistieron ningún día de ese periodo. El administrador podrá registrar la inasistencia semanal, descontar una clase y conservar un historial auditable para controlar la elegibilidad del alumno para el campeonato nacional.

## Regla funcional

- La semana deportiva comprende el jueves, viernes, sábado y domingo de la misma semana calendario, usando la zona horaria `America/Lima`.
- La alerta solo se muestra cuando la fecha seleccionada es domingo.
- Antes de mostrar candidatos, todas las reservas de alumnos de ese periodo deben estar resueltas como `attended`, `no_show` o `cancelled`; si queda alguna reserva `reserved`, se informa que primero debe completarse la asistencia.
- Es candidato un `student` que tenga una membresía vigente con `status = 'active'`, saldo mayor a cero y fecha de finalización igual o posterior al domingo evaluado.
- La presentación distinguirá membresías activas y por vencer; se considera “por vencer” cuando finaliza dentro de los siguientes siete días.
- Se excluye al alumno si tiene al menos una reserva `attended` en cualquier sesión entre el inicio del jueves y el final del domingo.
- También se excluye si ya tiene una inasistencia semanal registrada para el mismo periodo.
- Al confirmar `Marcar no asistió esta semana`, se descuenta exactamente una clase y se registra la inasistencia en el historial.
- La operación es idempotente por alumno y semana: repetirla no vuelve a descontar saldo.

## Modelo de datos

Se añadirá `public.student_weekly_attendance` como registro independiente de las reservas. Cada fila representa el resultado semanal de un alumno y contiene:

- `id`
- `student_id`
- `student_membership_id`
- `week_start` (jueves)
- `week_end` (domingo)
- `status`, inicialmente limitado a `no_show`
- `classes_consumed`, con valor `1`
- `marked_by_profile_id`
- `marked_at`
- `created_at`

Una restricción única sobre `(student_id, week_start)` impedirá duplicados. La tabla tendrá RLS; la lectura respetará `can_access_student(student_id)` y las escrituras quedarán exclusivamente dentro de una RPC administrativa.

El ledger admitirá el movimiento `weekly_no_show_consumed`, asociado a la membresía y al alumno. El movimiento tendrá `delta = -1`, el saldo posterior y una razón que incluya el periodo semanal.

## RPC administrativas

### `get_weekly_attendance_review(p_sunday date)`

La consulta validará que `p_sunday` sea domingo y devolverá:

- límites jueves-domingo;
- si quedan reservas pendientes de resolver;
- candidatos con identificación del alumno, avatar, membresía, saldo y estado visual `active` o `expiring`;
- conteos de asistencias encontradas durante el periodo.

La consulta operará siempre con `students.id`; `profiles.id` solo se usará para identificar al administrador.

### `admin_mark_weekly_no_show(p_student_id uuid, p_sunday date)`

La operación será transaccional y realizará nuevamente todas las validaciones bajo bloqueo:

1. usuario autenticado con rol admin;
2. fecha válida de domingo;
3. ausencia de reservas pendientes en la semana;
4. ninguna asistencia del alumno entre jueves y domingo;
5. membresía activa, vigente y con saldo;
6. ninguna inasistencia semanal previa.

Después bloqueará la membresía, insertará el registro semanal, descontará una clase y añadirá el movimiento al ledger. Si la fila semanal ya existe, devolverá éxito idempotente sin descontar otra clase.

Las funciones `SECURITY DEFINER` revocarán ejecución de `PUBLIC` y `anon`, comprobarán explícitamente `auth.uid()` e `is_admin_user()`, y concederán ejecución solo a `authenticated` y `service_role`.

## Interfaz administrativa

La sección se integrará al final de `/admin/asistencia`:

- Solo se solicitará la revisión semanal cuando `selectedDate` sea domingo.
- Si hay reservas pendientes de jueves a domingo, aparecerá un aviso ámbar con la cantidad pendiente y no se mostrarán acciones de descuento.
- Cuando todo esté resuelto, cada candidato aparecerá en una tarjeta con contorno rojo, nombre, avatar, plan, clases restantes y etiqueta `Activo` o `Por vencer`.
- La tarjeta explicará: `No registra asistencias entre jueves y domingo. Una inasistencia semanal afecta su elegibilidad para el campeonato nacional.`
- El botón `Marcar no asistió esta semana` pedirá confirmación explícita indicando que descontará una clase.
- Durante la operación, solo la tarjeta elegida quedará deshabilitada.
- Tras el éxito, se volverán a consultar la revisión semanal y las consultas de alumnos para actualizar saldo, membresía e historial sin refrescar la página.

## Historial del alumno

`useStudentDetail` cargará los eventos de `student_weekly_attendance` junto con las reservas. La pestaña `Asistencias` mostrará ambos tipos en una lista cronológica. La inasistencia semanal se verá como `No asistió`, con fecha del domingo, nota `Inasistencia semanal (jueves a domingo)` y sin sesión u horario ficticio.

## Estados de error

- Día distinto de domingo: no se muestra el panel y la RPC rechaza la operación.
- Reservas pendientes: se bloquea el marcado semanal.
- Alumno que asistió después de cargar la alerta: la RPC rechaza el marcado y la interfaz recarga los candidatos.
- Saldo agotado o membresía vencida: la RPC rechaza la operación y el alumno desaparece al recargar.
- Doble clic o reintento: la restricción única y la validación idempotente evitan un segundo descuento.
- Error de red: se conserva la tarjeta y se muestra un toast sin asumir que la operación concluyó.

## Pruebas y verificación

- Pruebas unitarias para el cálculo jueves-domingo y la visibilidad exclusiva del domingo.
- Pruebas de migración para candidatos activos/por vencer, exclusión por asistencia, bloqueo por reservas pendientes, seguridad e idempotencia.
- Prueba de interfaz para la tarjeta roja, confirmación, RPC y recarga de datos.
- Verificación completa con `npm test`, `npm run lint` y `npm run build`.
- Validación real de las RPC contra Supabase y comprobación visual autenticada de `/admin/asistencia` antes de declarar el flujo terminado.
