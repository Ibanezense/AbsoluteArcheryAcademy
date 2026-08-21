# Diseño: retraso masivo de vencimientos de membresías

## Objetivo

Permitir que administración retrase exactamente siete días el vencimiento de las membresías afectadas por una suspensión general de clases, sin alterar saldos, pagos ni fechas de inicio.

## Superficie administrativa

La página `Admin > Membresías` incorporará la acción **Retrasar vencimientos 7 días**. La acción abrirá un modal con:

- explicación de la regla;
- motivo obligatorio;
- vista previa del número de alumnos y membresías afectadas;
- confirmación explícita antes de escribir datos;
- estado pendiente que impida envíos duplicados.

Al finalizar se mostrará el total realmente actualizado y se refrescarán las consultas de alumnos, membresías, reservas, asistencia semanal y alertas de renovación.

## Regla de selección

La fecha de negocio se calculará en `America/Lima`. Una membresía será candidata cuando:

- su estado persistido sea `active`;
- tenga `classes_remaining > 0`;
- tenga una fecha de vencimiento;
- `end_date` sea igual o posterior a la fecha actual de Lima.

Esto incluye ciclos vigentes y ciclos futuros/programados. Se excluyen membresías vencidas, incluso si conservan clases, además de ciclos consumidos, cancelados, históricos y borradores.

Por cada alumno se actualizará una sola membresía. Si tiene dos o más candidatas, se elegirá la última mediante este orden estable:

1. `start_date DESC`;
2. `created_at DESC`;
3. `id DESC`.

La nueva fecha será `end_date + 7 días`. No se modificarán `start_date`, clases, pagos, importes ni origen de la membresía.

## Arquitectura y consistencia

La vista previa y la aplicación se expondrán mediante RPC administrativas. La aplicación volverá a calcular los objetivos dentro de la transacción, bloqueará las filas seleccionadas y realizará todas las actualizaciones de forma atómica.

La función será `SECURITY DEFINER`, fijará `search_path`, validará explícitamente que el actor sea administrador y revocará ejecución de `PUBLIC` y `anon`. Solo `authenticated` y `service_role` podrán ejecutarla.

Cada ejecución recibirá una clave de idempotencia. Un registro único de lote impedirá que un reintento por doble clic o pérdida de conexión vuelva a sumar siete días. El lote guardará administrador, motivo, fecha, cantidad afectada y resultado. El trigger de auditoría existente conservará además el cambio anterior y nuevo de cada membresía.

## Errores y concurrencia

- Un motivo vacío será rechazado tanto en la interfaz como en la base de datos.
- Una vista previa sin candidatos permitirá cerrar el modal, pero deshabilitará la confirmación.
- Si los datos cambian entre la vista previa y la confirmación, prevalecerá el cálculo transaccional y se informará el total real.
- Cualquier error revertirá el lote completo.
- Los ciclos sin `end_date` se omitirán porque no tienen un vencimiento que desplazar.

## Verificación

Las pruebas cubrirán:

- elegibilidad por estado, saldo y fecha Lima;
- exclusión de membresías ya vencidas con clases restantes;
- inclusión de ciclos futuros;
- elección de la última membresía por alumno;
- incremento exacto de siete días;
- idempotencia, autorización, permisos y `search_path`;
- vista previa, confirmación, bloqueo durante el envío e invalidación de cachés;
- suite completa, lint, TypeScript y build de producción;
- migración aplicada al proyecto Supabase real y prueba SQL de la RPC;
- commit en `main`, push y deployment de Vercel en estado `READY`.
