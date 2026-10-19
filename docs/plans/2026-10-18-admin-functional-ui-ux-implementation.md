# Plan de implementación: funcionalidad y UI/UX del administrador

> **Para Codex:** ejecutar este documento tarea por tarea con la guía `executing-plans`. Usar `systematic-debugging` para las inconsistencias y `verification-before-completion` antes de declarar un bloque terminado.

**Objetivo:** hacer que el administrador encuentre información fiable y complete reservas, renovaciones y asistencia con menos recorrido, con una presentación coherente en escritorio y móvil.

**Arquitectura:** mejorar las consultas de lectura y los componentes existentes de forma incremental. Conservar Next.js App Router, Supabase, React Query y los servicios/RPC actuales de escritura. Establecer primero las definiciones de los indicadores y después aplicar una misma estructura visual a los recorridos operativos.

**Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase/Postgres, TanStack Query, Vitest y revisión de navegador.

**Estado:** plan preparado. No se ha iniciado implementación, migración o despliegue.

**Raíz del repositorio:** `D:\PROGRAMACION\archery-reservas-pwa`. Las rutas de las tareas son relativas a esta raíz.

---

## 1. Base y decisiones de alcance

Fuente principal: [auditoría del 18 de octubre](../../output/auditoria-admin-2026-10-18/AUDITORIA.md), con sus capturas locales. Los datos observados son una referencia temporal, no valores que deban fijarse en el producto.

Se elige una mejora por recorridos completos. Una corrección exclusivamente visual dejaría indicadores y atajos confusos. Una reescritura total aumentaría el riesgo sobre reglas que ya funcionan.

### Incluido

- Última asistencia, clasificación de niveles, periodos y explicación de indicadores.
- Inicio, navegación, alumnos/ficha y reserva rápida como primera entrega utilizable.
- Membresías, turnos/asistencia, pruebas y finanzas como segunda entrega.
- Contraste, teclado, nombres accesibles, estados vacíos, errores y carga.
- Medición inicial y final de los mismos recorridos, datos y tamaños de pantalla.

### Fuera de esta implementación

- QR, IA, WhatsApp automático, facturación SUNAT y nuevas pasarelas de pago.
- Cambios de reglas de consumo, recuperaciones, vencimientos, capacidad o descuentos.
- Migrar el stack, sustituir autenticación o convertir el producto en un SaaS para otras academias.
- Reescribir el historial de asistencias, pagos o membresías para cuadrar indicadores.

### Reglas que deben conservarse

1. `students.id` identifica al alumno. `profiles.id` identifica la cuenta; el tutor puede gestionar varios alumnos.
2. Conservar ciclos de membresía independientes y el orden actual de consumo.
3. Una reserva no marcada no consume asistencia; conservar el cierre diario, los vencimientos y su historial.
4. Diferenciar saldo no consumido, clases reservadas y clases libres para reservar. Cero clases libres no implica automáticamente una membresía vencida.
5. Mantener disponibilidad por sede, equipo y libraje, reservas fijas, cortes de reserva y reprogramación.
6. Conservar autorización de RPC, RLS y validaciones actuales. Ninguna clave privilegiada llega al navegador.
7. Mantener la actualización de `studentKeys.all` y las demás cachés afectadas por cada operación.
8. Separar comprobaciones de lectura en producción de pruebas de escritura en un entorno con datos de prueba.

## 2. Diseño funcional propuesto

### Inicio

Orden: cabecera compacta y búsqueda → pendientes accionables → agenda de hoy → disponibilidad próxima por sede → resumen del mes plegable. Una reserva o renovación se abre con el alumno y el contexto correspondiente.

En móvil se muestra una acción principal, una franja breve de indicadores y una lista de trabajo. No se inserta un calendario semanal histórico antes de los pendientes. Los horarios finalizados permanecen consultables mediante fecha.

La campana se retira mientras no exista una bandeja útil. Los pendientes ya visibles mantienen su función; este alcance no incorpora otro sistema de notificaciones.

### Alumnos y ficha

La lista mantiene búsqueda y filtros; añade filtro por sede y orden por vencimiento si puede apoyarse en los datos fiables del bloque inicial. El teléfono y los datos complementarios pierden prioridad frente a nombre, estado, saldo y vencimiento.

La ficha comienza con identidad, estado, clases libres, clases reservadas y vencimiento. Las pestañas quedan inmediatamente después. Las alertas solo ocupan espacio cuando hay algo que resolver. Se conserva la edición del tutor y todos los accesos existentes.

### Reserva rápida

En móvil: Alumno → Fecha y turno → Confirmación. En escritorio: selección y resumen simultáneos cuando haya espacio. Ambos utilizan el mismo estado y las mismas validaciones.

Una sola zona principal de desplazamiento. Pie de acciones visible sin tapar campos. Cambiar alumno o fecha invalida un turno incompatible. Un envío pendiente bloquea duplicados. Los errores conservan la selección y permiten reintentar.

### Presentación

- Fondo claro neutro, superficies blancas y navegación sobria con identidad Absolute Archery.
- Naranja para selección y acción principal; colores de estado con significado estable.
- Conservar las familias tipográficas cargadas y ajustar su uso antes de añadir fuentes.
- Escala de separación de 4, 8, 12, 16, 24 y 32 píxeles. Encabezados con menos peso y menos espacio vertical que los actuales.
- Contraste mínimo objetivo de 4,5:1 para texto normal y 3:1 para texto grande. Medirlo, no deducirlo de una captura.
- Controles táctiles habituales de 44 × 44 píxeles. Foco visible y nombre accesible en todos los iconos accionables.
- Tablas compactas en escritorio; filas o tarjetas breves en móvil, con detalle bajo demanda.
- Formatos de dinero, fechas, equipos y medios de pago compartidos. Etiquetar Manual como un registro manual, sin presentarlo como un medio de pago confirmado.
- Retirar gráficos decorativos con datos fijos. `AdminSparkline` contiene hoy una serie constante; ninguna curva o barra debe aparentar una evolución real sin tener datos reales y periodo.

## 3. Entregas y dependencias

| Entrega | Tareas | Resultado verificable |
|---|---|---|
| E0. Línea base | T001 | Definiciones, casos y mediciones reproducibles |
| E1. Datos fiables | T002–T004 | Asistencias, niveles y calendarios coherentes |
| E2. Recorrido principal | T005–T009 | Inicio → alumno → ficha → reserva utilizable en móvil y escritorio |
| E3. Resto de operación | T010–T013 | Membresías, asistencia, pruebas y finanzas con el mismo criterio |
| E4. Validación | T014–T015 | Evidencia de pruebas, revisión visual y candidato para publicar |

Secuencia: T001 → T002/T003/T004 → T005/T006 → T007/T008/T009 → T010/T011/T012/T013 → T014 → T015. Las tareas indicadas en una misma etapa pueden ejecutarse secuencialmente. El plan no requiere delegación ni trabajo simultáneo.

## 4. Tareas de implementación

### T001. Registrar definiciones y línea base

**Archivos:** crear `docs/qa/admin-ux-baseline.md` y `docs/qa/admin-metrics-contract.md`. Consultar `lib/queries/studentQueries.ts`, `lib/hooks/useAdminDashboardData.ts`, `lib/services/FinancesService.ts`, `app/admin/membresias/page.tsx` y las definiciones desplegadas de sus RPC.

**Pasos:**

1. Registrar rama, revisión y estado del repositorio. Preservar `.vercel/`, `output/` y `tmp/`; no limpiar archivos del usuario.
2. Preparar una rama `codex/admin-ux-audit` para implementar. Si hace falta aislamiento, inspeccionar los worktrees existentes y usar uno apropiado; no copiar secretos al informe.
3. Medir los mismos recorridos en 390 × 844 y 1440 × 1000: encontrar próxima clase, localizar alumno, llegar a sus reservas y abrir una renovación. Registrar pasos, desplazamiento y tiempos observados sin inventar un resultado inicial.
4. Leer la definición real de las RPC y documentar, por indicador, población, estados incluidos, periodo, zona horaria, moneda y fuente.
5. Conciliar los importes de Inicio, Membresías y Finanzas con lectura de registros. Registrar diferencias justificadas; no corregirlas solo para que coincidan.
6. Identificar un entorno de prueba con usuarios admin, alumno y tutor y datos ficticios. Si no existe, registrar las pruebas de escritura como pendientes hasta disponer de él.

**Aceptación:** contrato de métricas explícito; hipótesis de la auditoría separadas de causas demostradas; ninguna modificación de negocio.

**Commit previsto:** `docs(admin): define audit baseline and metric semantics`.

### T002. Obtener una última asistencia correcta por alumno

**Archivos:** modificar `lib/queries/studentQueries.ts`, `lib/queries/studentQueries.test.ts`; crear `tests/supabase/adminLastAttendance.integration.sql`. Si el diagnóstico lo exige, generar una migración con nombre lógico `admin_last_attendance_summary` mediante la CLI, sin inventar su fecha.

**Depende de:** T001.

**Pasos:**

1. Reproducir la discrepancia con consulta agregada y respuesta de lectura del listado. Comprobar límites de filas, orden, relaciones y políticas; determinar la causa antes del cambio.
2. Preparar un caso que falla con más de 1000 asistencias globales y una asistencia reciente situada fuera del primer bloque. Incluir alumno sin historial, reserva cancelada y marcación realizada después de la sesión.
3. Si se confirma truncamiento, devolver una fila por alumno con la última fecha real mediante una consulta agregada protegida; no descargar todo el historial al navegador ni resolverlo aumentando arbitrariamente el límite.
4. Mantener la fecha de la clase como referencia de asistencia cuando exista y el identificador `student_id`. Restringir acceso a administradores por los mecanismos vigentes. Revisar índices existentes antes de crear otro.
5. Integrar el resultado en `useStudents` y distinguir error de lectura de ausencia real de asistencias.
6. Ejecutar el caso SQL con transacción y rollback en pruebas; verificar también que alumno y tutor no obtienen historiales ajenos. Comprobar lista, ficha y registro diario con el mismo alumno.

**Validación:** `npm test -- lib/queries/studentQueries.test.ts`; ejecutar el archivo SQL con conexión de pruebas. Los tests de texto SQL no sustituyen la ejecución real.

**Aceptación:** misma última asistencia en lista/ficha/registro, incluso con historial superior al límite de una respuesta.

**Commit previsto:** `fix(admin): return complete last attendance summaries`.

### T003. Hacer explícita la población de los indicadores

**Archivos:** modificar `lib/utils/adminDashboard.ts`, `lib/utils/adminDashboard.test.ts`, `lib/hooks/useAdminDashboardData.ts` y `app/admin/page.tsx`; crear `tests/supabase/adminDashboardMetrics.integration.sql`. Revisar `supabase/migrations/20260430_180000_admin_operational_dashboard.sql` como antecedente, sin editarlo. Generar una migración nueva solo si debe corregirse la RPC.

**Depende de:** T001.

**Pasos:**

1. Probar alumnos con niveles descriptivos, `Nivel 1`, nivel vacío y valores desconocidos, con la misma definición de alumno activo del contrato.
2. Agregar una categoría Sin clasificar; no convertir automáticamente Nivel 1 en principiante ni editar perfiles históricos sin una equivalencia de negocio confirmada.
3. Asegurar que las categorías y Sin clasificar suman el total de su población. Añadir campos al resultado de manera compatible con el frontend existente.
4. Separar reservas activas, asistencias efectivas y ocupación histórica. Evitar denominar ocupación a una proporción que solo cuenta reservas aún pendientes.
5. Aplicar las definiciones de T001 a importes y deudas; conservar diferencias de alcance válidas y explicarlas en el nombre o ayuda del indicador.
6. Mostrar Dato no disponible y reintento cuando falla una fuente; no mostrar cero como sustituto de un error.

**Validación:** `npm test -- lib/utils/adminDashboard.test.ts lib/hooks/useAdminDashboardData.test.ts`; ejecutar el caso SQL en pruebas y comprobar compatibilidad del contrato anterior.

**Aceptación:** cada total tiene población definida y los estados incompletos no aparentan ceros reales.

**Commit previsto:** `fix(admin): align dashboard populations and metric labels`.

### T004. Unificar semana y fecha operativa

**Archivos:** modificar `app/admin/sesiones/page.tsx`, `lib/utils/introCalendar.ts`, `lib/utils/introCalendar.test.ts`; crear `lib/utils/adminCalendar.ts` y `lib/utils/adminCalendar.test.ts` solo para centralizar el contrato necesario. Consultar `lib/utils/dateUtils.ts` y `lib/utils/membershipCycles.ts`.

**Depende de:** T001.

**Pasos:**

1. Escribir casos de lunes, domingo, fin de mes, fin de año y cambio de día UTC/Lima, usando relojes fijos.
2. Reutilizar la lógica existente de fechas de calendario y obtener lunes–domingo sin depender del idioma global de Day.js.
3. Inicializar Turnos con el parámetro de fecha válido o con hoy en Lima; mantener Hoy como acción explícita.
4. Aplicar el mismo rango en etiquetas, consultas, selección y navegación de Pruebas y Turnos.
5. Mantener fechas civiles como fechas civiles; no trasladar un `YYYY-MM-DD` al día anterior por conversión de zona.

**Ejemplo de regresión:** `weekDates('2026-10-18')` debe devolver del `2026-10-12` al `2026-10-18`, tanto con idioma español como inglés.

**Validación:** `npm test -- lib/utils/introCalendar.test.ts lib/utils/adminCalendar.test.ts`; revisar ambos calendarios con fecha fija y comprobar navegación al lunes siguiente.

**Aceptación:** Turnos y Pruebas muestran la misma semana y el mismo día actual.

**Commit previsto:** `fix(admin): align calendar weeks and Lima dates`.

### T005. Ajustar los componentes visuales compartidos

**Archivos:** modificar `components/admin/AdminVisualSystem.tsx`, `components/admin/AdminOperationalComponents.tsx`, `app/globals.css`, `tailwind.config.js` y `tests/app/adminVisualSystem.test.ts`.

**Depende de:** T001; T002–T004 no deben bloquear la definición visual, pero sí su cierre integrado.

**Pasos:**

1. Definir variantes compactas de los encabezados, paneles y métricas existentes. Evitar crear un segundo sistema de componentes.
2. Separar estilos específicos de admin de los estilos del portal de alumno/tutor. Corregir primero colores explícitos en superficies oscuras y evaluar cualquier cambio global con ambos portales.
3. Retirar la serie fija de `AdminSparkline` de los indicadores. Conservar gráficos con datos reales, periodo y estados vacíos definidos.
4. Reducir sombras, radios y peso tipográfico de acuerdo con el diseño propuesto. Mantener naranja y logotipo de la academia.
5. Preparar estados de carga, vacío, error y sin permiso con una acción coherente.
6. Actualizar pruebas que exigían gráficos decorativos o clases CSS antiguas. No crear pruebas que solo comprueben que existe una clase Tailwind.

**Validación:** revisión visual antes/después en ambos tamaños, contraste medido y comprobación de que el portal del alumno conserva legibilidad.

**Aceptación:** no hay títulos oscuros sobre superficies oscuras ni gráficos con datos aparentes inventados.

**Commit previsto:** `feat(admin): simplify shared visual components`.

### T006. Unificar navegación, filtros y lenguaje

**Archivos:** modificar `components/AdminSidebar.tsx`, `components/AdminBottomNav.tsx`, `components/PageShell.tsx` y `app/admin/layout.tsx`; crear `components/admin/AdminFilterBar.tsx`, `lib/utils/adminPresentation.ts` y `lib/utils/adminPresentation.test.ts` para su uso compartido entre los módulos. Consultar `components/ui/ConfirmDialog.tsx`.

**Depende de:** T005.

**Pasos:**

1. Mantener Inicio, Alumnos y Asistencia como accesos frecuentes; conservar Membresías y añadir un acceso Más inequívoco a Turnos, Pruebas, Finanzas y Ajustes en móvil.
2. Reducir altura y decoración de la cabecera móvil. Evitar que menú y navegación inferior compitan o tapen un diálogo.
3. Unificar filtros plegables en móvil con cantidad de filtros activos y Limpiar. Mantener filtros visibles en escritorio cuando haya espacio.
4. Centralizar presentación de dinero, fechas, equipos y métodos de pago. Un valor desconocido debe mostrarse sin inventar una equivalencia.
5. Añadir nombres a iconos, foco visible, cierre por Escape y retorno de foco al abrir/cerrar menús y diálogos. No alterar permisos.

**Validación:** `npm test -- lib/utils/adminPresentation.test.ts tests/components/confirmDialogAccessibility.test.ts`; recorrer con teclado y abrir todos los módulos desde móvil.

**Aceptación:** todos los destinos son accesibles, los controles tienen nombre y la navegación no tapa la acción principal.

**Commit previsto:** `feat(admin): unify navigation filters and labels`.

### T007. Reorganizar el inicio y conectar los atajos

**Archivos:** modificar `app/admin/page.tsx`, `components/admin/WeekendIntroCapacity.tsx`, `lib/utils/adminDashboard.ts`, `tests/app/adminDashboardNavigationDesign.test.ts` y `tests/app/adminWeekendIntroCapacityDashboard.test.ts`. Crear `lib/utils/adminNavigation.ts` y `lib/utils/adminNavigation.test.ts` para los destinos compartidos si resulta necesario.

**Depende de:** T002–T006.

**Pasos:**

1. Mostrar pendientes y agenda de hoy antes del detalle semanal. Compactar disponibilidad futura por sede y hacer consultables los días anteriores.
2. Retirar la campana sin función. No implementar un backend nuevo de notificaciones en este bloque.
3. Cambiar Registrar pago a Ver finanzas hasta que exista una acción directa de registro respaldada por el flujo actual.
4. Enviar estado, alumno, fecha y sede en los accesos de seguimiento; interpretar y validar esos parámetros en el destino correspondiente.
5. Enlazar reprogramación con el flujo administrativo que ya existe. Evitar mandar al administrador a una pantalla de alumno que requiera otro contexto.
6. Retirar Fallback, scheduled y ayudas sobre cómo está construida la pantalla.
7. Probar sin pendientes, sin horarios futuros, error de una fuente y carga inicial. Mantener consulta del resumen mensual sin anteponerla al trabajo diario.

**Validación:** probar destinos de forma determinista; revisión real de búsqueda → ficha y pendiente → módulo filtrado.

**Aceptación:** a 390 × 844 hay una tarea real del día visible en la primera pantalla; todos los atajos corresponden con su texto y conservan el contexto.

**Commit previsto:** `feat(admin): prioritize daily work on dashboard`.

### T008. Convertir reserva rápida en un flujo adaptable

**Archivos:** modificar `components/AdminQuickBooking.tsx`, `lib/utils/adminQuickBooking.ts`, `lib/utils/adminQuickBooking.test.ts` y `tests/app/adminQuickBookingRedesign.test.ts`; crear `lib/utils/adminQuickBookingFlow.ts` y `lib/utils/adminQuickBookingFlow.test.ts` para las transiciones que lo necesiten. Reutilizar `lib/adminBookingQueries.ts` y `lib/services/adminBookingService.ts`.

**Depende de:** T005–T007.

**Pasos:**

1. Probar transiciones: no avanzar sin alumno, cambiar alumno invalida turno, cambiar fecha invalida turno y retroceder conserva selecciones compatibles.
2. Implementar los pasos Alumno, Fecha y turno, Confirmación, compartiendo estado con la presentación de escritorio.
3. Ajustar ancho mínimo de tarjetas y campos; una sola zona principal desplazable, pie visible y altura compatible con teclado móvil.
4. Conservar alumno preseleccionado al abrir desde su ficha y todos los avisos de equipo, fechas, saldo y reserva forzada.
5. Mantener confirmación explícita antes de llamar a la RPC; bloquear doble envío y preservar selección ante un error.
6. Al completar, refrescar las consultas ya afectadas y mostrar la reserva creada. Verificar que cerrar o retroceder no genera escrituras.

**Validación:** `npm test -- lib/utils/adminQuickBooking.test.ts lib/utils/adminQuickBookingFlow.test.ts lib/services/adminBookingService.test.ts`; operación real en pruebas con recarga y comprobación de una única reserva.

**Aceptación:** sin desplazamiento horizontal a 360 y 390 píxeles; selección, validación y creación completas; saldos y recursos siguen las reglas previas.

**Commit previsto:** `feat(admin): make quick booking usable on mobile`.

### T009. Compactar lista y ficha del alumno

**Archivos:** modificar `app/admin/alumnos/page.tsx`, `app/admin/alumnos/[id]/page.tsx`, `lib/utils/adminStudentList.ts`, `lib/utils/adminStudentList.test.ts`, `tests/app/adminStudentsCompactList.test.ts`, `tests/app/adminStudentProfileOperationalRedesign.test.ts` y `tests/app/adminAlumnoDetailCacheInvalidation.test.ts`.

**Depende de:** T002, T005–T008.

**Pasos:**

1. Probar combinación de búsqueda, estado, sede y orden por vencimiento, con fechas fijas y sin excluir alumnos por carecer de teléfono o foto.
2. Compactar listado móvil; mantener nombres legibles o permitir consultar el nombre completo sin depender de hover.
3. Sustituir el resumen alto de la ficha por identidad y datos operativos esenciales; conservar la separación entre clases libres y reservadas.
4. Situar pestañas cerca de la cabecera, retirar fotos repetidas y omitir alertas vacías.
5. Abrir Reserva rápida con alumno fijado y Renovar con el alumno preseleccionado. Conservar tutor, datos deportivos, historial y administración de acceso.
6. Verificar que guardar o mutar membresía actualiza lista y ficha sin F5. No mostrar ni copiar códigos de acceso en las evidencias.

**Validación:** `npm test -- lib/utils/adminStudentList.test.ts tests/app/adminAlumnoDetailCacheInvalidation.test.ts tests/app/adminStudentsCompactList.test.ts`; recorrido búsqueda → ficha → reservas → agregar reserva.

**Aceptación:** resumen y pestañas visibles sin atravesar tarjetas decorativas; historial consistente; invalidación y permisos conservados.

**Commit previsto:** `feat(admin): streamline student list and profile`.

### T010. Simplificar venta y renovación de membresías

**Archivos:** modificar `app/admin/membresias/page.tsx`, `components/admin/MembershipExpiryExtensionModal.tsx`, `tests/app/adminMembershipsActiveAndPlans.test.ts` y `tests/app/adminMultipleMembershipCycles.test.ts`. Reutilizar `lib/services/adminMembershipService.ts` y `lib/utils/studentRenewalDate.ts`.

**Depende de:** T003, T005, T006 y T009.

**Pasos:**

1. Mostrar por defecto pendientes/listado con métricas compactas. Abrir el formulario al pulsar Nueva venta o Renovar; mantener búsqueda de alumno.
2. Ordenar formulario por alumno y plan → fechas/horarios → importe/pago → resumen. Preservar obsequios, becas, múltiples periodos, descuentos y horarios fijos de Umacollo.
3. Corregir contraste de cabeceras y explicar el consumo cronológico sin términos internos.
4. Trasladar la extensión masiva de vencimientos a una acción secundaria, manteniendo autorización, alcance, previsualización y confirmaciones existentes.
5. Verificar aprobación de renovación y creación de ciclos independientes; no fusionar saldos ni restaurar clases vencidas.

**Validación:** `npm test -- lib/services/adminMembershipService.test.ts lib/utils/studentRenewalDate.test.ts tests/app/adminMultipleMembershipCycles.test.ts tests/supabase/multipleActiveMemberships.test.ts`; ejecución transaccional y flujo real en pruebas.

**Aceptación:** se puede renovar desde la ficha sin seleccionar de nuevo al alumno, y las reglas de ciclos/pagos permanecen intactas.

**Commit previsto:** `feat(admin): simplify membership sale and renewal`.

### T011. Mejorar turnos y asistencia

**Archivos:** modificar `app/admin/sesiones/page.tsx`, `app/admin/asistencia/page.tsx`, `components/admin/AdminOperationalComponents.tsx`, `tests/app/adminSessionsResponsiveRedesign.test.ts` y `tests/app/adminAttendanceCancellationSurface.test.ts`.

**Depende de:** T003–T006.

**Pasos:**

1. Mostrar turno con sede, fecha y hora; recordar selección en la URL para entradas desde Inicio y Turnos.
2. Priorizar el día seleccionado. Resumir días anteriores en lugar de desplegar toda la semana por defecto.
3. Mostrar acciones según estado: Marcar asistencia para pendiente, información de asistencia para asistido y corrección excepcional con nombre explícito.
4. Inspeccionar qué hace Cancelar antes de cambiar su etiqueta. Mantener las confirmaciones y reglas del servicio que realmente utiliza.
5. Unificar Volver con un destino claro; dar nombre accesible a flechas y controles de icono.
6. Verificar invalidación de lista/ficha/dashboard tras marcar o cancelar. El estado se refleja sin una recarga manual.

**Validación:** `npm test -- tests/app/adminAttendanceCancellationSurface.test.ts tests/supabase/attendanceConsumesMembership.test.ts lib/services/adminBookingService.test.ts`; marcar una asistencia de prueba y comprobar un único consumo; cierre de día y cancelación conservan su regla.

**Aceptación:** se identifica inequívocamente sede/turno y cada registro ofrece solo acciones aplicables.

**Commit previsto:** `feat(admin): clarify session and attendance actions`.

### T012. Adaptar pruebas a agenda móvil

**Archivos:** modificar `app/admin/intro/components/IntroCalendarClient.tsx`, `app/admin/intro/components/IntroCalendarToolbar.tsx`, `app/admin/intro/components/IntroWeekCalendar.tsx` y `app/admin/intro/components/IntroStatusBoard.tsx`; crear `app/admin/intro/components/IntroDayAgenda.tsx`. Mantener `app/admin/intro/components/IntroAppointmentForm.tsx`, `app/admin/intro/components/IntroAppointmentDetail.tsx`, `lib/utils/introCalendar.ts` y sus servicios como fuentes de reglas.

**Depende de:** T004–T006.

**Pasos:**

1. Incorporar agenda diaria por sede como vista inicial en móvil y mantener semana/estados accesibles. Conservar semana como vista inicial de escritorio.
2. Plegar filtros secundarios en móvil; mostrar fecha, sede y cantidad de citas sin anteponer una columna extensa de controles.
3. Separar visualmente estado de cita y estado de pago, sin crear equivalencias nuevas entre ambos.
4. Mantener edición por botón para cualquier acción que hoy también permita arrastre. No depender de arrastrar para operar en móvil o con teclado.
5. Conservar pagos en sede, cortesías, tipos de clase, disponibilidad y distinción de horarios pasados.

**Validación:** `npm test -- lib/utils/introCalendar.test.ts lib/services/introCalendarService.test.ts lib/services/IntroClassesService.test.ts`; probar filtros y reprogramación con datos ficticios, confirmando recursos y pago después de recargar.

**Aceptación:** agenda útil sin desplazamiento horizontal en móvil; no se altera el significado de los pagos.

**Commit previsto:** `feat(admin): add daily trial agenda for mobile`.

### T013. Compactar finanzas y hacer comprensibles sus cifras

**Archivos:** modificar `app/admin/finanzas/FinancesClient.tsx`, `lib/services/FinancesService.ts` y `tests/app/adminFinancesProductivityPhase3B.test.ts`; crear `lib/utils/adminFinanceFilters.ts` y `lib/utils/adminFinanceFilters.test.ts` para comprobar el universo filtrado y la paginación sin depender de la presentación. Cualquier cambio SQL exige migración nueva y validación de T001.

**Depende de:** T001, T003, T005 y T006.

**Pasos:**

1. Mostrar resumen y movimientos antes de filtros extensos en móvil. Reducir indicadores duplicados.
2. Aplicar periodos explícitos y explicar si morosidad se refiere al periodo o a toda la cartera. Corregir cálculo solo cuando T001 demuestre un defecto.
3. Normalizar etiquetas y formatos sin cambiar valores guardados ni convertir métodos desconocidos en métodos supuestos.
4. Limitar inicialmente la lista a 25 movimientos y ofrecer siguiente página o cargar más. Si el volumen exige paginación de servidor, mantener totales del periodo completo y exportación de todos los registros filtrados, no solo de la página.
5. Verificar que cambiar filtro reinicia página y que CSV concuerda con el conjunto filtrado. Mantener diferenciación de pagos de membresías e introducción.
6. Retirar ayudas que describen el código o el diseño de la tabla.

**Validación:** `npm test -- lib/utils/adminFinanceFilters.test.ts tests/app/adminFinancesProductivityPhase3B.test.ts`; comparar ingresos con registros de prueba y descargar CSV del mismo rango.

**Aceptación:** importes y alcance comprensibles; lectura móvil compacta; filtros/paginación no cambian accidentalmente los totales.

**Commit previsto:** `feat(admin): clarify and compact finance reporting`.

### T014. Verificación transversal y medición final

**Archivos:** crear `docs/qa/admin-ux-validation.md`; actualizar `docs/qa/admin-ux-baseline.md`. Guardar capturas finales en una carpeta distinta de las originales, sin publicar datos privados.

**Depende de:** T002–T013.

**Pasos:**

1. Ejecutar comprobaciones completas: `npm test`, `npm run lint`, `npx tsc --noEmit` y `npm run build`. Registrar salidas y distinguir fallos previos de nuevos.
2. Iniciar la compilación de producción local con `npm run start -- -p 3000` si el puerto está disponible; no terminar procesos ajenos. Usar otro puerto documentado cuando corresponda.
3. Revisar 360 × 800, 390 × 844, 768 × 1024 y 1440 × 1000; comprobar zoom al 200 %, navegación por teclado y contraste.
4. Ejecutar los recorridos de la matriz siguiente con datos de prueba; recargar al terminar las escrituras para verificar persistencia.
5. Medir pasos, desplazamiento, carga percibida y peticiones de los mismos recorridos de T001. Registrar tiempos con igual entorno y datos. No atribuir una mejora de rendimiento a cambios visuales sin medirla.
6. Revisar las consultas corregidas con volumen suficiente y planes de ejecución cuando proceda. Evitar traer todos los historiales al cliente para resumirlos.
7. Comprobar alumno y tutor por el efecto de componentes globales. Confirmar denegación de rutas/lecturas administrativas.
8. Revisar cada A01–A14 contra su criterio y guardar evidencia. Marcar pendiente lo no probado; no declarar aprobado por una comprobación de texto fuente.

**Aceptación:** sin defectos de prioridad alta abiertos, sin regresión de reglas, sin desbordamiento en formularios y con evidencia visual/funcional por recorrido.

**Commit previsto:** `test(admin): document end-to-end UX verification`.

### T015. Preparar revisión y publicación controlada

**Archivos:** actualizar `docs/qa/admin-ux-validation.md` con revisiones, migraciones y enlaces de entornos cuando existan.

**Depende de:** T014.

**Pasos:**

1. Revisar el diff final, migraciones, permisos y resultados. Mantener commits por tarea; no incluir secretos, capturas privadas ni directorios de salida.
2. Presentar las entregas E2 y E3 mediante pantallas reales comparables con la auditoría, además de los resultados funcionales.
3. Preparar migraciones aditivas con compatibilidad temporal: frontend anterior funciona tras migrar y frontend nuevo no consume campos inexistentes. No aplicar cambios de base de datos de producción durante la preparación.
4. Documentar reversión del frontend y compensación de lectura mediante una nueva migración si hiciera falta; no borrar historial o repetir escrituras para revertir presentación.
5. Dejar el candidato listo para revisión. Publicar únicamente cuando el usuario autorice esa publicación; entonces aplicar las guías de Vercel/Supabase vigentes y verificar producción por separado.

**Aceptación:** distinguir local, base de datos de pruebas, preview y producción. Un build correcto no equivale a una función probada ni a una publicación comprobada.

## 5. Matriz mínima de pruebas de usuario

| Recorrido | Resultado exigido | Entorno |
|---|---|---|
| Inicio → pendiente → destino | Filtro y contexto correctos | Preview/lectura |
| Buscar alumno → ficha → asistencias | Última asistencia coincide con la lista | Pruebas y lectura real |
| Ficha → reserva → confirmar | Una reserva, validaciones y recursos correctos | Pruebas |
| Reserva → cambiar alumno o fecha | Se descarta el turno incompatible | Pruebas |
| Error al crear reserva → reintentar | Selección conservada, sin duplicados | Pruebas |
| Ficha → renovar | Alumno preseleccionado, ciclo nuevo independiente | Pruebas |
| Turno → marcar asistencia | Un solo consumo y actualización inmediata | Pruebas |
| Reserva sin asistencia → cierre diario | Regla actual conservada, sin consumo ficticio | Pruebas SQL |
| Prueba → cambiar cita | Estado/pago y recursos coherentes tras recargar | Pruebas |
| Finanzas → filtro → página → CSV | Mismo universo filtrado y total del periodo | Pruebas |
| Menú móvil/teclado → todos los módulos | Destinos accesibles, foco y cierre correctos | Preview |
| Alumno/tutor → ruta administrativa | Acceso denegado sin filtrar datos | Pruebas |

## 6. Correspondencia con la auditoría

| Hallazgo | Tareas responsables |
|---|---|
| A01. Última asistencia | T001, T002, T009 |
| A02. Inicio extenso | T007 |
| A03. Modal desbordado | T008 |
| A04. Campana sin acción | T007 |
| A05. Distribución parcial | T003 |
| A06. Semanas diferentes | T004, T011, T012 |
| A07. Contraste | T005, T010 |
| A08. Textos internos | T006, T007, T010–T013 |
| A09. Móvil poco adaptado | T006, T008–T013 |
| A10. Ficha extensa | T009 |
| A11. Atajos ambiguos | T007, T009, T013 |
| A12. Asistencia confusa | T011 |
| A13. Controles sin nombre | T006, T011, T014 |
| A14. Criterio visual | T005, T006, T014 |

## 7. Cómo ejecutar y cerrar cada tarea

1. Leer los archivos actuales y el estado de la entrega previa. Ajustar el plan si el código cambió, dejando el motivo registrado.
2. Para lógica de datos y negocio, escribir el caso que reproduce el fallo y comprobar que falla por el motivo previsto.
3. Hacer el cambio mínimo que cumple el contrato. Para ajustes visuales simples, usar revisión real; no añadir tests que repitan literalmente el marcado.
4. Ejecutar pruebas relevantes y comprobar la pantalla/recorrido afectado. Mantener SQL integrado y pruebas de permisos cuando cambien consultas o RPC.
5. Registrar resultado y commit enfocado. Si una comprobación no se pudo ejecutar, conservar ese estado visible.

La configuración actual de Vitest usa entorno Node y descubre `*.test.ts`; no suponer que existen Testing Library, jsdom o Playwright Test configurados. Los tests actuales que inspeccionan archivos pueden mantenerse como comprobaciones de estructura, pero no acreditan comportamiento ni disposición visual. Si se decide automatizar la matriz en navegador, preparar ese soporte explícitamente y justificar sus dependencias; mientras tanto, la validación de navegador documentada es obligatoria.

## 8. Definición de completado

- A01–A14 tienen solución comprobada o una decisión explícita que explica su cierre.
- Inicio, ficha, reserva y renovación funcionan con los criterios móviles del plan.
- Las métricas expresan su población y periodo; no se ocultan valores desconocidos convirtiéndolos en cero.
- Formularios sin desplazamiento horizontal, controles legibles y navegación por teclado utilizable.
- Se conservan reglas de membresías, recursos, asistencia, tutores y autorización.
- Pasan pruebas relevantes, suite completa, lint, TypeScript y build; hay evidencia de los recorridos reales en pruebas.
- Se dispone de comparación antes/después, mediciones y procedimiento de publicación/reversión.
- La publicación, si posteriormente se autoriza, queda verificada en su entorno real y registrada como tal.

## Registro de ejecución

Implementado en `codex/admin-ux-audit`. T001–T013 cuentan con cambios y pruebas; T014–T015 tienen validación local y preparación de entrega. El detalle de resultados y los pendientes de integración SQL, escrituras de negocio, accesibilidad completa y publicación figuran en `docs/qa/admin-ux-validation.md`. La migración está preparada y no aplicada a producción.
