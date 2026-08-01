# Membresías múltiples por alumno — Diseño

## Objetivo

Permitir que un alumno conserve varias membresías abiertas sin mezclar sus clases, fechas ni movimientos. Esto cubre tanto la compra anticipada de varios períodos como la entrega de clases de obsequio. El consumo seguirá un orden determinista: primero la membresía elegible con fecha de inicio más antigua y, cuando se agote, la siguiente.

## Reglas funcionales

- Cada compra, período u obsequio crea una fila independiente en `student_memberships`.
- Asignar una membresía nueva no convierte las anteriores en históricas.
- Una membresía con fecha futura se muestra como `Programada`; esta es una presentación derivada y no requiere mezclar su saldo con el período actual.
- Para la fecha de una clase solo son elegibles las membresías abiertas cuyo `start_date` ya comenzó, cuyo `end_date` no venció y cuyo saldo sea mayor a cero.
- Entre las membresías elegibles se consume primero la de `start_date` más antigua. Los desempates usan `created_at` y `id` en orden ascendente.
- Si las clases de una membresía ya están consumidas o comprometidas por reservas pendientes, la siguiente reserva puede usar la próxima membresía elegible.
- Una reserva conserva `active_membership_id`; la asistencia, inasistencia, cancelación o devolución opera sobre la misma membresía que cubrió la reserva.
- La inasistencia semanal sin reserva consume de la membresía elegible más antigua para el domingo evaluado.
- Las clases no utilizadas no se trasladan entre membresías. Una membresía vencida conserva su saldo histórico, pero deja de ser elegible.

## Creación de períodos consecutivos

El formulario administrativo permitirá indicar una cantidad de períodos, con valor inicial `1`.

- La fecha elegida corresponde al inicio del primer período.
- Cada período siguiente empieza el día posterior al final del anterior.
- La duración, las clases y el precio de cada período provienen del plan seleccionado.
- Antes de confirmar se muestra una vista previa de cada membresía y el total de la operación.
- La creación es transaccional: se crean todos los períodos o ninguno.
- Cada período recibe su propio número de documento, saldo, fechas, importe, pago y movimiento de activación.
- El descuento comercial se calcula de forma consistente por período y el resumen muestra también el total agregado.

La fecha sugerida del primer período será el día posterior a la fecha final más tardía de las membresías abiertas del alumno. El administrador podrá modificarla para permitir períodos superpuestos cuando exista una razón operativa.

## Membresías de obsequio

El formulario distinguirá `Pagada` y `Obsequio`.

- Un obsequio crea otra membresía independiente.
- El administrador define el número de clases y sus fechas de inicio y fin.
- El importe y el pago quedan en cero.
- La membresía se identifica con origen `gift` y una etiqueta visible `Obsequio`.
- Su saldo entra en el mismo orden de consumo por fecha de inicio; no altera las membresías pagadas.
- Las notas permiten registrar el motivo del beneficio.

## Modelo de datos

La migración será aditiva y conservará todos los registros actuales.

- Se elimina el índice único parcial `idx_student_memberships_one_active`, que hoy limita a una membresía con estado `active` por alumno.
- Se añade un campo de origen controlado para distinguir membresías pagadas y obsequios, manteniendo compatibilidad con las existentes como pagadas.
- Se añade un índice no único para resolver eficientemente las membresías abiertas por alumno, estado y fechas.
- `admin_assign_membership_plan` deja de cerrar membresías anteriores y crea siempre un ciclo nuevo.
- Una nueva RPC administrativa de creación múltiple valida y crea períodos consecutivos dentro de una sola transacción.
- La RPC valida rol administrativo, cantidad positiva de períodos, plan activo, fechas válidas, montos no negativos y datos específicos del obsequio.
- Las funciones privilegiadas revocan acceso a `PUBLIC` y `anon`, y conceden ejecución únicamente a `authenticated` y `service_role` con validación explícita del rol admin.

## Selección y consumo de membresía

La selección se centralizará en una regla reutilizable para evitar órdenes diferentes entre reservas, asistencias y alertas:

1. filtrar por el alumno;
2. exigir un estado abierto;
3. comprobar vigencia para la fecha de la clase;
4. calcular saldo disponible como clases restantes menos reservas pendientes vinculadas;
5. ordenar por `start_date ASC`, `created_at ASC`, `id ASC`;
6. elegir la primera con disponibilidad.

Los flujos que ya reciben una membresía explícita validarán que pertenezca al alumno y sea elegible. Los flujos automáticos usarán la regla anterior. Al consumir la última clase, solo esa membresía pasa a `consumed`; las demás permanecen intactas.

## Interfaz administrativa

### Venta o asignación

En `/admin/membresias` el formulario incluirá:

- tipo `Membresía pagada` u `Obsequio`;
- alumno y plan para una venta;
- cantidad de períodos;
- fecha inicial;
- método, descuento y pago;
- cantidad de clases y fechas propias para un obsequio;
- vista previa de los ciclos que se crearán;
- total por período y total general.

Se eliminarán los mensajes de reemplazo. La confirmación explicará que las membresías se conservarán separadas y mostrará las fechas y clases de cada fila nueva.

### Listados y ficha del alumno

- La ficha muestra el total de clases utilizables, la cantidad de membresías abiertas y cuál se consumirá primero.
- Cada membresía se presenta por separado con plan, origen, fechas, saldo y estado visual.
- Los estados visibles son `En consumo`, `Programada`, `Consumida`, `Vencida`, `Cancelada` o `Histórica`.
- La membresía `En consumo` es la elegible más antigua con disponibilidad; las posteriores se muestran como programadas o en espera.
- El historial de asistencias y el ledger identifican la membresía exacta que perdió o recuperó la clase.
- Después de crear, editar, consumir o cancelar se invalidan las consultas globales de alumnos, membresías, reservas y asistencia afectadas para actualizar la interfaz sin F5.

## Compatibilidad y migración

- Las membresías existentes no se alteran ni se combinan.
- No se reabre automáticamente ninguna membresía histórica, vencida o consumida.
- Los pagos, reservas y movimientos existentes conservan sus referencias.
- Los resúmenes que actualmente eligen una sola membresía se actualizan para sumar saldos utilizables y exponer la membresía prioritaria.
- Las reservas existentes siguen consumiendo de su `active_membership_id`; solo las nuevas selecciones aplican el nuevo orden.
- La automatización del estado operativo del alumno considera que basta una membresía utilizable para mantenerlo activo, respetando primero los estados protegidos como bloqueado, suspendido, retirado o baja.

## Errores y casos límite

- Si ninguna membresía cubre la fecha de la sesión, la reserva se rechaza aunque exista una membresía futura.
- Si la membresía más antigua ya tiene todas sus clases comprometidas, se intenta la siguiente elegible.
- Si todas están comprometidas o agotadas, se rechaza la reserva.
- Las fechas superpuestas son válidas; el orden más antiguo primero sigue siendo determinista.
- Una edición que deje inválidas reservas ya vinculadas se rechaza o requiere resolverlas antes.
- Un fallo al crear varios períodos revierte toda la operación.
- Reintentos de una operación confirmada deben evitar duplicados mediante una clave idempotente de la operación múltiple.

## Verificación

- Pruebas SQL para varias membresías abiertas, creación transaccional, seguridad y prioridad por fecha ascendente.
- Pruebas de reservas para saldos comprometidos, salto a la siguiente membresía y fechas futuras.
- Pruebas de asistencia, inasistencia, cancelación y devolución sobre la membresía vinculada.
- Pruebas de inasistencia semanal usando la membresía elegible más antigua.
- Pruebas de interfaz para múltiples períodos, obsequios, vista previa, etiquetas y actualización automática.
- Verificación completa con `npm test`, `npm run lint` y `npm run build`.
- Validación contra Supabase y comprobación visual autenticada de los flujos administrativos antes de declarar la implementación terminada.
