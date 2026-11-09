# Corrección de asistencia de reservas canceladas

## Comportamiento solicitado

En la pestaña Asistencias de la ficha administrativa, permitir marcar una reserva cancelada como asistida. El cambio debe afectar la reserva original, consumir una sola clase de su membresía o recuperación vinculada y registrar al administrador y el movimiento. La operación debe ser atómica y segura ante reintentos y acciones simultáneas.

Para membresías finalizadas, el usuario aprobó ajustar el cierre por vencimiento sin descontar dos veces. Debe conservarse un historial verificable del cierre original y su corrección; no se debe reactivar la membresía ni conceder crédito recuperable.

## Restricciones verificadas

- `admin_mark_attendance` rechaza reservas canceladas y rechaza membresías finalizadas.
- El cierre crea `membership_class_expirations`, registra un movimiento en `student_credit_ledger` y bloquea cambios posteriores en los saldos mediante `protect_finalized_membership_classes`.
- El historial presenta una fila no recuperable por cada unidad del evento de vencimiento. La corrección debe ajustar también esta presentación para que no aparezca simultáneamente la asistencia y la misma clase como vencida.
- No se deben activar reservas pasadas para evitar reasignar arcos y cupos históricos o provocar otra cancelación de cierre de día.
- Deben excluirse reservas futuras y verificarse pertenencia, saldo, cancelaciones, recuperaciones, permisos administrativos y duplicados en el servidor.

## Verificación necesaria

Cubrir membresías vigentes y finalizadas, créditos normales y de recuperación, autorización, reintentos y concurrencia, cierre de día, historial y auditoría. Verificar el recorrido en la ficha administrativa antes de activar cambios en producción.
