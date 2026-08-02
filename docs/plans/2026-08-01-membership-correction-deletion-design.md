# Eliminación correctiva de membresías

## Objetivo

Permitir que un administrador corrija una membresía ingresada por error mediante edición o eliminación. La eliminación debe borrar de forma atómica los pagos, movimientos de crédito y reservas vinculadas al ciclo, sin permitir que se altere un historial de asistencia real.

## Regla de negocio aprobada

- Una membresía con al menos una reserva en estado `attended` o `no_show` no se puede eliminar.
- Una membresía sin `attended` ni `no_show` se puede eliminar sin importar si está activa, programada, vencida, consumida, cancelada o histórica.
- Al eliminarla se borran primero todas sus reservas vinculadas por `bookings.active_membership_id`, luego sus pagos, movimientos de crédito y finalmente la membresía.
- La operación completa ocurre en una sola transacción. Cualquier error revierte todos los borrados.
- Tras eliminar, se recalcula el estado operativo del alumno para que el siguiente ciclo FIFO quede visible y utilizable cuando corresponda.
- La edición existente se mantiene disponible para corregir nombre, fechas, estado, clases, importe, moneda y notas sin eliminar el ciclo.

## Seguridad e integridad

La operación se expone mediante `admin_delete_student_membership(uuid)` como función `SECURITY DEFINER`, con `search_path` fijo, comprobación explícita de sesión y rol administrador, y permisos revocados para `PUBLIC` y `anon`. La membresía y sus reservas se bloquean antes de validar o borrar para evitar carreras con nuevas reservas o marcaciones de asistencia.

El resultado devuelve contadores de reservas, pagos y movimientos eliminados para mostrar al administrador qué se corrigió. La UI no intenta borrar tablas directamente.

## Experiencia de usuario

El botón se denomina `Eliminar membresía` y aparece también en ciclos activos o futuros. Antes de ejecutar, una confirmación destructiva explica que se borrarán la membresía, sus pagos y sus reservas. Si existe asistencia o `no_show`, el backend rechaza la operación y la interfaz muestra el motivo sin modificar datos.

Después de editar o eliminar se invalidan las consultas de alumnos, membresías, reservas, asistencia semanal y finanzas, y se recargan los datos visibles.

## Verificación

- Pruebas de contrato SQL para permisos, bloqueo, validación de asistencia, borrado y sincronización.
- Pruebas de UI para disponibilidad del botón, confirmación y mensajes.
- Suite completa, TypeScript, ESLint, build de producción y `git diff --check`.
- Aplicación de migración en Supabase antes del despliegue de Vercel.
- Verificación HTTP y estado `READY` del despliegue de producción.
