# Verificación del calendario de clases de prueba

Implementación del plan aprobado el 11 de octubre de 2026, incluida la aclaración de pago presencial en Umacollo.

## Resultado

- `/admin/intro` ofrece Semana y Estados, navegación de fechas, filtros de sede/estado/pago y búsqueda.
- La semana va de lunes a domingo y las horas se muestran en America/Lima.
- Todas las sedes se presentan en agendas separadas. Los turnos vacíos y llenos siguen visibles al filtrar citas.
- Las tarjetas permiten abrir detalle, editar y reprogramar. Hay arrastre mediante ratón, táctil o teclado y alternativas mediante botones.
- El formulario permite pago pendiente y «Pagará en sede». Reservar ocupa cupo sin registrar un ingreso cobrado.
- Los seis estados conservan pago y asistencia como datos independientes. Cancelar no borra el pago ni registra una devolución automática.
- Las operaciones validan administrador, identidad de la cita, cupo físico, equipamiento y versión del registro. Los cambios generan auditoría.

## Comprobaciones realizadas

| Requisito | Evidencia |
| --- | --- |
| Fechas y estados | Pruebas unitarias de límite UTC/Lima, semana que cruza año, prioridad de estados y filtro de pago con asistencia. |
| Registro y edición | Navegador: crear cita pendiente con pago en sede, editar nombre/edad desde móvil y recuperar los datos mediante editBookingId después de navegar de nuevo. |
| Calendario semanal | Navegador de escritorio a 1440 × 1000: arrastrar del miércoles al jueves; origen y destino recalculan ocupación. |
| Kanban | Navegador: arrastrar Por pagar → Pagado solicita datos de pago; guardar efectivo coloca la tarjeta en Pagado. El teclado también abre el mismo flujo de cambio de columna. |
| Cancelación y reactivación | Navegador: cancelar una cita pagada conserva su pago; reactivarla solicita confirmación y conserva importe/método. |
| Asistencia | Navegador y SQL: No show y corrección a Asistido en sesión pasada conservan pago pendiente. La sesión futura rechaza el cambio y muestra el motivo sin cambiar la tarjeta. |
| Cambio de sede | Navegador móvil: Umacollo → Tiabaya, confirmación explícita, fecha/turno nuevos y conservación de datos y pago pendiente. |
| Móvil | Vista a 390 × 844, selección de día y formulario funcional. Ancho de contenido y viewport iguales: sin desbordamiento horizontal. |
| Encabezados | Zona de calendario con desplazamiento propio en escritorio. Al desplazarla 599 px, el encabezado de los días mantuvo la misma posición vertical. |
| Concurrencia | API autenticada: dos solicitudes simultáneas por el último cupo producen un éxito y un rechazo. Dos cambios con la misma versión producen un éxito y un conflicto. |
| Capacidad | SQL transaccional: turno lleno rechaza registro, edición de datos en turno lleno funciona y reprogramación/cancelación actualizan cupos. |
| Arcos compartidos | SQL transaccional: ocupar todos los arcos en una sesión bloquea disponibilidad de otra sesión solapada; excluir la reserva propia y liberar un arco restauran disponibilidad. |
| Finanzas | SQL: un pago pending con paid_at conserva su dato original y no aparece como ingreso. Un pago confirmado aparece en el reporte. |
| Permisos | SQL: acceso anónimo y no administrativo rechazado; funciones administrativas sin EXECUTE para anon; helper interno sin EXECUTE para authenticated; auditoría con RLS. |
| Errores y privacidad | Detalle con teléfono oculto inicialmente, cambio de estado confirmado, error visible y retorno al estado anterior. Sin errores de ejecución en la consola durante las interacciones verificadas. |

Se realizó una revisión independiente. Se corrigieron el registro duplicado de tarjetas/destinos de arrastre, el overlay, la disponibilidad de recursos compartidos y las claves de invalidación. La segunda revisión no encontró defectos pendientes que bloquearan el cierre.

## Base de datos

Migraciones aplicadas y archivos sincronizados con las versiones del historial remoto:

- `20261012001158_intro_week_calendar.sql`: intención de pago presencial, lectura semanal, registro/cambios atómicos, auditoría y No show exclusivo para pruebas.
- `20261012001727_intro_calendar_resource_availability.sql`: disponibilidad real de arcos en sesiones solapadas y exclusión de la propia reserva.
- `20261012002000_intro_confirmed_payment_reports.sql`: ingresos solo de pruebas con pago confirmado; RPC de calendario VOLATILE para permitir los bloqueos de sus helpers en PostgREST.

Las comprobaciones SQL están en `tests/supabase/introCalendar.integration.sql` y `tests/supabase/introCalendarResources.integration.sql`. Ejecutarlas dentro de BEGIN / ROLLBACK sobre una base que tenga las migraciones y las sedes correspondientes. No modifican definitivamente los datos de prueba.

## Limpieza y alcance

Las sesiones, citas, clientes y pagos aislados usados para las pruebas de API/navegador fueron retirados. La comprobación final encontró cero sesiones con las marcas de esta prueba. Los nueve pagos pendientes existentes que tenían una fecha conservan sus valores originales; solo cambió la regla del reporte.

La captura `output/intro-calendar/semana-escritorio.jpg` utiliza datos de prueba de 2036, ya retirados. No representa citas reales agendadas para esa fecha.

Comprobaciones finales en la carpeta principal: 127 archivos de prueba y 668 pruebas aprobadas; lint y TypeScript sin errores y build de producción satisfactorio. Las dos pruebas adicionales impiden duplicar los nodos de las tarjetas entre escritorio/móvil o dentro del overlay. Los avisos de Browserslist sobre su catálogo antiguo ya existían y no impiden el build.

La interfaz se implementó localmente. No se publicó un nuevo despliegue ni se enviaron mensajes a clientes.
