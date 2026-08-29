# Reactivación de cuenta al asignar membresía

## Problema confirmado

La lista administrativa deriva el estado visible desde `students` y `student_memberships`, mientras que el inicio de sesión bloquea directamente cuando `profiles.is_active = false`. Por eso una membresía nueva puede dejar al alumno académicamente activo pero con su cuenta autenticada todavía inactiva.

El caso observado en producción tiene una membresía vigente, `students.operational_status = 'active'` y `students.is_active = true`, pero su perfil vinculado conserva `profiles.is_active = false`.

## Regla aprobada

Al insertar una membresía activa con clases disponibles:

- Reactivar la cuenta individual indicada por `students.self_profile_id`.
- Retirar el estado manual `inactive` antes de recalcular el estado académico.
- Sincronizar `students.operational_status` e `is_active` según la vigencia real de las membresías.
- No reactivar automáticamente alumnos `retired`, `withdrawn`, `blocked` o `suspended`.
- No modificar cuentas de tutores; solo el perfil individual vinculado por `self_profile_id` cuando su rol sea `student`.
- No reactivar una cuenta por una membresía cuya fecha de término ya pasó.

## Diseño técnico

Una migración añadirá un trigger `AFTER INSERT` sobre `student_memberships`. El trigger actuará únicamente cuando la fila insertada tenga estado `active` y saldo positivo. La operación quedará dentro de la misma transacción que crea la membresía, evitando que la membresía y el acceso queden desincronizados si una segunda llamada falla.

Para un alumno manualmente inactivo, el trigger retirará temporalmente la protección de `inactive` y ejecutará `sync_student_membership_operational_status`. Una membresía vigente lo dejará activo; una membresía futura permitirá el acceso a la app, pero mantendrá su estado académico en pausa hasta la fecha de inicio.

Los estados protegidos de seguridad o baja conservarán tanto su estado académico como el bloqueo de su cuenta.

La acción administrativa **Bloquear alumno** persistirá `students.account_access_blocked` mediante un RPC administrativo transaccional y actualizará en la misma operación la cuenta individual. El bloqueo de acceso queda así separado del estado académico: `inactive` se conserva al bloquear y reactivar, y `retired`, `withdrawn`, `blocked` o `suspended` no pueden habilitarse desde ese botón. El trigger respeta también este bloqueo explícito. Además, la sincronización priorizará una membresía futura utilizable sobre el historial vencido y mantendrá al alumno en `paused` hasta su inicio.

Como la interfaz anterior solo registraba el bloqueo en `profiles.is_active`, la migración marcará conservadoramente como bloqueadas las cuentas individuales que ya estén deshabilitadas. La reparación aprobada quitará el indicador únicamente al caso confirmado que todavía cumpla todas las precondiciones.

## Reparación de producción

Después de aplicar la migración, se corregirá de manera dirigida la cuenta actualmente afectada, validando primero que aún tenga una membresía vigente, que su alumno esté activo y que no pertenezca a un estado protegido. La actualización habilitará exclusivamente su `profiles.is_active`.

## Verificación

- Prueba contractual RED/GREEN para la migración y sus restricciones.
- Prueba transaccional en Supabase para cuenta inactiva + membresía vigente.
- Prueba de que `blocked`, `suspended`, `retired` y `withdrawn` no se reactivan.
- Comprobación del caso real después de la reparación.
- Suite completa, lint, TypeScript y build antes de integrar en `main`.
