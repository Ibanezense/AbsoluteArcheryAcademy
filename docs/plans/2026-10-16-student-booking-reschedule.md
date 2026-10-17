# Reprogramación administrativa de reservas

Desde el perfil del alumno, Reservas permite elegir una nueva fecha, sede y turno. Mostrar disponibilidad y razones de bloqueo; confirmar antes de mover. Mantener ID de reserva, membresía y tipo de crédito; no descontar ni devolver clases. Lista ordenada por fecha de sesión, incluyendo cambios tras guardar.

- RPC de opciones y escritura exclusiva para administradores activos. Comprobar estado futuro, vigencia, congelamiento, distancia, cruces, límite semanal y recursos.
- Movimiento atómico con bloqueo de capacidad y control de versión. Liberar recursos anteriores y reclamar los nuevos; todo revierte si falla. Registrar auditoría.
- Actualizar detalle y cachés de turnos, reservas, informes y calendario.
- Verificar pruebas unitarias, SQL de integración reversible, interacción en navegador, lint y compilación. Publicar main y verificar producción.

## Verificación realizada

- 685 pruebas unitarias aprobadas; lint y compilación de producción aprobados.
- SQL real con rollback: identidad, saldo, transferencia de recursos, auditoría, control de versión, cupo lleno, vencimiento, congelamiento, cruce y permisos.
- Arco compartido: reprogramación a un turno superpuesto conserva el mismo arco sin bloquearse a sí misma.
- Dos solicitudes concurrentes al último cupo: una aceptada y una rechazada; reserva rechazada conservada.
- Navegador local: cambio de 09:00 a 12:00, actualización automática y orden 11:00, 12:00.
- Revisión de código: corregidos nombres de campos y orden de bloqueos mediante migraciones aditivas, conservando el historial aplicado.
