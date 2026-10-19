# Contrato de indicadores administrativos

Comprobado con definiciones desplegadas y consultas agregadas de solo lectura el 18 de octubre de 2026. Los valores siguientes son evidencia de esa fecha, no datos del producto.

| Indicador | Universo y alcance |
|---|---|
| Última asistencia | Máxima fecha de clase entre reservas `attended` del alumno; usar fecha de marcación solo si no hay fecha de sesión. Leer el historial completo o su agregado. |
| Clases libres | Saldo utilizable menos compromisos de reserva conforme al motor vigente; distinto de saldo total abierto. |
| Alumnos por nivel | Misma población que el contador de alumnos activos; niveles sin equivalencia explícita se muestran Sin clasificar. No inferir el nivel deportivo a partir de un número. |
| Semana | Lunes a domingo, fechas civiles y día actual America/Lima. |
| Cobros del mes | Pagos con estado paid y paid_at dentro del intervalo del mes; excluye source migration. |
| Valor de ciclos creados | Suma de total_amount de membresías creadas durante el mes, independientemente de la fecha del cobro. No equivale a caja cobrada. |
| Finanzas, movimientos | Reporte por paid_at del intervalo; incluye membresías y pagos confirmados de introducción. Un pendiente sin paid_at no necesariamente aparece en esa lista. |
| Pendiente del periodo, proyección | Pagos pendientes/late con due_date dentro del periodo; especificar alcance en la ayuda. |
| Pendientes vencidos | Cartera global con estado pending/late y due_date anterior a la fecha de referencia; no es la misma población que los movimientos por paid_at. |
| Ocupación por reservas pendientes | Reservas todavía activas sobre capacidad configurada. No describe automáticamente la participación histórica después de registrar asistencia. |

## Conciliación observada

- Cobros de membresías de octubre: S/3360; introducción: S/420; total combinado: S/3780.
- El valor S/3305 de la pantalla de membresías se calculaba con ciclos creados y total_amount; su etiqueta de ingresos era equívoca. Debe presentarse como valor de ciclos creados, no forzarse a igualar caja.
- Había cuatro registros vencidos de importe cero. Son registros pendientes sin importe por cobrar, no S/0 de deuda monetaria repartida entre cuatro deudores. Conservar los registros y explicar su naturaleza.

## Estados desconocidos y fallos

Los fallos de lectura se presentan como dato no disponible con reintento. Cero solo se muestra después de una lectura correcta. No actualizar historial ni estados de pago como parte de una corrección de presentación.

La migración opcional de resumen de asistencias se entrega sin aplicar a producción. El frontend debe funcionar antes y después de ella mediante fallback completo y paginado, limitado a errores de función no disponible. Un error de autorización nunca activa ese fallback.
