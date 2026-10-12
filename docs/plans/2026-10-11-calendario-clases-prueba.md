# Calendario de clases de prueba — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rediseñar `/admin/intro` con una agenda semanal por sede, creación y edición de citas, filtros y arrastre entre turnos o estados.

**Architecture:** Reutilizar las entidades `sessions`, `bookings`, `intro_clients`, `intro_payments` y `academy_locations`. Separar la presentación del calendario, las consultas por semana y las operaciones administrativas. Conservar pago y asistencia como datos independientes y calcular el estado visible de cada cita.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, React Query, Supabase, Vitest; biblioteca de arrastre accesible por seleccionar y verificar antes de instalar.

## Alcance y evidencia

Plan propuesto para revisión. No se ha implementado ni modificado código de la aplicación. La inspección fue local; no confirma el esquema desplegado.

- `app/admin/intro/IntroClient.tsx` contiene agenda diaria, tabla, filtros, detalle y edición.
- `app/admin/intro/components/RegisterIntroModal.tsx` registra citas por sede y turno.
- `lib/services/IntroClassesService.ts` dispone de registro y actualización mediante RPC.
- La agenda actual consulta desde hoy, durante 31 días por defecto, y excluye `cancelled`.
- La lectura actual calcula capacidad con asignaciones a 10 m y un valor de respaldo de 12. La consulta de disponibilidad usa capacidad de equipamiento; el calendario nuevo debe unificar esa fuente.
- La definición local de `admin_update_intro_class` de septiembre valida disponibilidad de equipo incluso al editar datos sin cambiar turno. Se debe separar edición de datos, reprogramación y cambio de estado para evitar bloquear correcciones históricas o de sesiones llenas.
- `package.json` incluye Vitest y el comando `npm run test`.

## Diseño propuesto

1. Cabecera: «Calendario de clases de prueba», intervalo visible y botón «Nueva cita».
2. Barra: semana anterior, Hoy, semana siguiente, selector de fecha, sede, estados y búsqueda por nombre o teléfono.
3. Vista predeterminada: semana de lunes a domingo, columnas por día, fecha y resaltado de hoy; tarjetas compactas dentro de bloques de turnos reales ordenados por hora.
4. Cada turno muestra sede, hora de inicio y fin, ocupación real y cupos disponibles. Se muestran también turnos llenos y vacíos. Distinguir «Sin horarios», «Sin citas que coincidan» y «Sin cupos».
5. Con una sede seleccionada se muestra una sola agenda. Con «Todas las sedes» se muestran agendas separadas por sede dentro de la misma semana, evitando mezclar inventarios.
6. Tarjeta: nombre, hora, sede, edad, estado principal y dato de pago cuando aporte información. Acciones de detalle, edición y cambio de estado. Mantener el tratamiento actual de teléfonos.
7. Selector «Semana / Estados». La segunda vista es un kanban de seis columnas con las mismas citas y filtros. No se incluyen vistas de mes y día en la primera entrega.
8. En móvil, selector de día y agenda vertical; acciones «Reprogramar» y «Cambiar estado» equivalentes al arrastre. En escritorio, desplazamiento horizontal si hace falta y encabezados de días persistentes al desplazarse.

## Estados y reglas

| Estado visible | Regla propuesta |
| --- | --- |
| Reservado | Reserva activa gratuita o de cortesía, sin pago aplicable. |
| Por pagar | Reserva activa de clase con cobro pendiente, incluido quien pagará presencialmente. Mostrar «Paga en sede» cuando se haya indicado esa intención. |
| Pagado | Reserva activa con pago confirmado. |
| Asistido | `booking_status = attended`; conservar el pago. |
| No show | `booking_status = no_show`; conservar el pago. |
| Cancelado | `booking_status = cancelled`; conservar el pago. |

La prioridad visual es cancelación o asistencia, seguida del estado de pago. Una cita asistida con pago pendiente sigue mostrando «Por pagar» como información secundaria y puede filtrarse por pago mediante un filtro adicional.

Regla aclarada por el usuario: en Umacollo hay personas que reservan y pagarán presencialmente. Se usará «Por pagar» para todas las citas con cobro pendiente y «Pagado» para el pago confirmado. Reservar el cupo no exige haber pagado. «Reservado» queda para citas sin cobro aplicable; no se usará como un segundo estado equivalente a cobro pendiente.

Añadir al registro y edición una opción «Pagará en sede». Persistir esta intención como un dato separado del método de pago efectivo y mostrar la etiqueta «Paga en sede». No asumirla por la sede ni asignarla a registros históricos sin evidencia. Esta opción estará disponible para cualquier sede, incluido Umacollo. Al confirmar el pago, registrar el método real y retirar el aviso pendiente. Un importe previsto no se cuenta como ingreso cobrado.

Arrastrar a Pagado requiere completar monto y método cuando corresponda. Arrastrar a Por pagar modifica el pago y debe advertir si revierte un pago confirmado. Mover a Reservado una cita con cobro abre la edición para resolver su tipo y pago; no borra ingresos silenciosamente. Cancelar libera el cupo según las reglas existentes y no genera una devolución automática. Reactivar requiere validar disponibilidad. Corregir asistencia debe utilizar o adaptar el mecanismo existente de reversión.

## Interacciones

- «Nueva cita» abre el formulario existente adaptado. Pulsar un turno vacío precarga fecha, sede y turno; no crea sesiones nuevas.
- Pulsar una tarjeta abre el panel de detalle con edición y selector de estados.
- Arrastrar dentro de la semana reprograma hacia una sesión real, conserva identidad y pago y valida cupo en el servidor. Un cambio de sede muestra origen y destino antes de guardar.
- Una zona sin turno válido o sin cupo no acepta la tarjeta. Las citas asistidas, no show o canceladas requieren resolver su estado antes de reprogramarlas.
- Arrastrar en la vista Estados cambia el estado; las transiciones con datos necesarios abren el formulario correspondiente.
- Mientras se guarda se bloquea una segunda modificación de la misma cita. Si falla, la tarjeta vuelve al origen y se muestra el motivo. Dos administradores intentando ocupar el último cupo no pueden generar sobreocupación.
- Fechas y límites semanales se calculan en `America/Lima`, independientemente de la zona del dispositivo.

## Implementación por tareas

### T001. Contrato de calendario y reglas de estado

Crear `lib/utils/introCalendar.ts` y `lib/utils/introCalendar.test.ts`. Definir rango semanal, agrupación por sede/día/turno, estado visible, prioridad y transiciones. Probar semana que cruza mes/año, pago pendiente con asistencia y cancelación sin pérdida de pago.

### T002. Consultas por intervalo y disponibilidad real

Modificar `lib/services/IntroClassesService.ts`. Añadir consulta por intervalo y sede, incluir canceladas en la lectura de citas y separar ese resultado del cálculo de ocupación. Consultar sesiones que aceptan pruebas, incluyendo sesiones existentes con citas históricas aunque su configuración haya cambiado. Mostrar su condición y bloquear nuevas reservas cuando corresponda.

Crear `lib/hooks/useIntroCalendar.ts` con claves de React Query por intervalo y sede. Cargar sesiones sin reservas, llenas y no disponibles para nueva reserva cuando tengan citas. Ampliar la consulta de disponibilidad a la semana seleccionada; no usar el horizonte fijo de 31 días para navegar semanas.

### T003. Operaciones administrativas

Revisar las versiones actuales de registro, actualización, asistencia, reversión y cancelación en `supabase/migrations/` y contrastarlas con el esquema del entorno de pruebas. Reutilizarlas cuando cumplan el contrato. Crear migración aditiva mediante Supabase CLI solo si hace falta para operaciones específicas de reprogramación o estado.

Validar administrador, relación cita/cliente, sesión que acepta pruebas, equipamiento y concurrencia dentro de la transacción. La edición de nombre o teléfono no debe depender de cupos libres. La reprogramación debe detectar modificaciones concurrentes para evitar sobrescribir cambios de otro administrador. Los cambios de pago deben seguir el mecanismo de Finanzas existente y distinguir importe pendiente de ingreso cobrado.

### T004. Agenda semanal y filtros

Modificar `app/admin/intro/page.tsx` y `app/admin/intro/IntroClient.tsx` para dar prioridad al calendario y compactar los indicadores actuales.

Crear en `app/admin/intro/components/`: `IntroCalendarToolbar.tsx`, `IntroWeekCalendar.tsx`, `IntroSessionSlot.tsx` e `IntroAppointmentCard.tsx`. Aplicar Tailwind y el sistema visual administrativo existente, tomando de la imagen la distribución y densidad. Los filtros modifican tarjetas y contadores de resultados, sin alterar los cupos reales de cada turno.

### T005. Registro, detalle y edición

Modificar `app/admin/intro/components/RegisterIntroModal.tsx` para recibir valores iniciales de sede/turno y respetar disponibilidad. Añadir la opción «Pagará en sede» con estado Por pagar, sin exigir método de pago efectivo ni registrar el importe pendiente como ingreso. Adaptar el contrato y las operaciones administrativas para persistir esa intención. Extraer el detalle y la edición de `IntroClient.tsx` a componentes dedicados si es necesario para compartirlos entre vistas. Mantener compatibilidad con `editBookingId`, cargando por ID cuando la cita esté fuera de la semana visible.

### T006. Arrastre y kanban de estados

Verificar una biblioteca compatible con React 18, teclado y táctil antes de añadirla. Crear `IntroStatusBoard.tsx` y `lib/hooks/useIntroAppointmentActions.ts`. Implementar reprogramación y transición de estado con destinos válidos, formulario cuando falten datos, guardado pendiente y recuperación tras error. Mantener alternativas por botones y teclado.

### T007. Sincronización y verificación

Invalidar calendario, disponibilidad, resumen de pruebas, asistencia y Finanzas cuando la operación afecte esos datos. Revisar las claves reales existentes antes de añadir nuevas.

Ejecutar `npm run test`, `npm run lint` y `npm run build`; validar en navegador con datos aislados: crear, editar sin mover en turno lleno, mover, cambiar sede, pagar, asistir, no show, cancelar, reactivar y recargar. Verificar un conflicto real por último cupo y un error de guardado. Revisar escritorio y móvil, semanas anteriores/futuras y ausencia de cambios en reservas de alumnos regulares.

## Definición de completado

- Todas las citas de la semana consultada aparecen en el turno y sede correctos, incluidas canceladas cuando el filtro lo permite.
- Los seis estados son visibles y editables con reglas consistentes de pago y asistencia.
- Una cita de Umacollo con pago presencial pendiente reserva cupo, muestra «Por pagar · Paga en sede» y no genera ingreso cobrado hasta confirmar el pago.
- Fechas, sede y estado filtran ambas vistas; una semana sin citas mantiene los turnos disponibles visibles.
- Crear y editar guarda datos reales; reprogramar conserva la misma reserva y su pago.
- Cancelar libera capacidad sin borrar historial ni registrar una devolución implícita.
- No se permite sobreocupación ni escritura por usuarios sin permisos de administrador.
- Los cambios persisten al recargar y actualizan los módulos afectados.
- Las interacciones funcionan con ratón, teclado y acciones equivalentes en móvil.

## Límites de esta entrega

Solo planificación. No aplicar migraciones, modificar citas reales, desplegar ni implementar hasta que el usuario autorice continuar. La regla de cobro pendiente incorpora la aclaración del usuario sobre pago presencial en Umacollo.
