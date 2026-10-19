# Auditoría de experiencia del alumno

Fecha: 19/10/2026, America/Lima. Versión local de `codex/admin-ux-audit`, backend real de la academia. Revisión con la cuenta indicada por el usuario; la clave de acceso no se guarda en este informe. El recorrido muestra un alumno asociado y controles de cambio de alumno propios del contexto de tutor. Las conclusiones se refieren a este recorrido, no a todas las cuentas o modalidades.

Se ingresó por la UI en 127.0.0.1:3100 para conservar la sesión administrativa de localhost. Se revisaron inicio, agenda, semanas anterior/siguiente, membresía, filtros y paginación del historial, Mis reservas, detalle de clase cancelada, reserva inexistente y protección de administración. Tamaños: 390×844 y 1440×1000. No se crearon ni cancelaron reservas, ni solicitudes de renovación, pagos o cambios de membresía. Solo consultas y navegación; autenticación normal autorizada.

## Hallazgos funcionales prioritarios

### P1 — El resumen de uso depende del historial cargado y mezcla planes

En Mi membresía, Canceladas empieza en 2. Tras Cargar más historial cambia a 3. Las clases disponibles y usadas se mantienen en 6 y 10. Reabrir la pantalla vuelve a mostrar 2.

Contraste de lectura: el plan actual tiene 2 canceladas y 10 asistencias; el historial completo tiene 10 canceladas y 66 asistencias. Por tanto, 3 no corresponde ni al plan ni al historial completo. Los filtros también trabajan sobre las páginas cargadas y pueden omitir resultados antiguos hasta cargar más.

Causa: `usage` y `filteredHistory` se derivan de `history`, mientras los saldos provienen del resumen de membresía. Ubicación: `app/membresias/page.tsx:55`, `lib/hooks/useBookingHistory.ts:30`.

Recomendación: declarar el alcance del resumen —plan actual o historial completo— y calcular sus totales completos en servidor. Aplicar filtros antes de paginar. Mantener contadores estables al cargar páginas.

### P1 — Se ofrecen turnos que la membresía no cubre

La cuenta tiene un plan activo hasta el 25/10 y ninguna membresía posterior. En la semana 26/10–01/11 aparecen turnos del 29/10 al 01/11, con cupos y botones Reservar este turno habilitados.

La consulta disponible calcula capacidad física/equipo. La UI solo bloquea por estado general del dashboard, no por elegibilidad del alumno para cada fecha. El código de creación sí comprueba vigencia y cuota por sesión. No se ejecutó la creación: se demuestra una oferta/acción engañosa en la UI, no una reserva aceptada fuera de vigencia.

Ubicación: `app/reservar/page.tsx:88`, `app/reservar/page.tsx:166`, `supabase/migrations/20260927132137_per_session_booking_cutoff.sql:195`.

Recomendación: devolver elegibilidad y motivo por sesión. Mostrar «Necesitas renovar para esta fecha» y una acción adecuada, diferenciando falta de membresía, límite semanal, falta de saldo y cupos agotados. Conservar la validación del servidor.

## Mejoras de UX y recuperación

### P2 — Vencimiento visible sin camino persistente para renovar o pedir ayuda

Inicio y membresía avisan Próxima a vencer y seis días restantes, pero no muestran un acceso de renovación. El botón Soporte del inicio está deshabilitado. La renovación existente depende del aviso automático de última clase o membresía vencida; no cubre este estado observado.

Ubicación: `app/page.tsx:223`, `lib/utils/membershipRenewalPrompt.ts:59`, `components/MembershipRenewalPrompt.tsx:155`.

Recomendación: acción persistente en Mi membresía para revisar renovación o contactar con la academia, reutilizando el flujo existente y mostrando el estado de solicitudes pendientes. No introducir compra automática ni cambiar reglas de aprobación.

### P2 — Una reserva inexistente queda cargando indefinidamente

Al abrir una reserva sintética inexistente, la pantalla permanece en Cargando contenido del alumno, sin explicación ni reintento. La navegación inferior permite salir. La condición `loading || !data` devuelve el mismo skeleton incluso después de terminar la consulta con resultado vacío/error.

Ubicación: `app/reserva/[id]/page.tsx:44`, `app/reserva/[id]/page.tsx:60`.

Recomendación: separar carga, error, no encontrado y acceso denegado. Ofrecer volver a Mis reservas o reintentar según corresponda.

### P2 — Fechas y nombre del plan se recortan en móvil

A 390 px, el campo Inicio mide 93 px y su texto 99 px; el nombre del plan necesita 258 px y recibe 93 px. Ambos usan ellipsis. Se ven valores como 26/09/20… y Membres… en información esencial. No hay desbordamiento de la página; el problema es truncado dentro de las tarjetas.

Ubicación: `app/membresias/page.tsx:134`, `app/membresias/page.tsx:236`.

Recomendación: fechas en dos columnas y plan a todo el ancho; permitir varias líneas para el nombre. Reservar truncado para datos secundarios.

### P2 — La reserva se ejecuta con un solo clic y sin resumen previo

El botón Reservar este turno llama directamente a `book_session_multisite`. No se ejecutó durante la auditoría. Falta una revisión del alumno, sede, fecha, hora y efecto en el saldo antes de confirmar. Tampoco se muestran saldo/vencimiento/cuota restantes en el contexto de agenda.

Ubicación: `app/reservar/page.tsx:92`, `app/reservar/page.tsx:166`.

Recomendación: resumen breve y confirmación explícita; tras éxito, mostrar la reserva y actualizar el saldo compartido. No sumar una pantalla extensa por cada turno.

### P2 — Información interna y ubicación insuficiente

La agenda explica «El sistema usará el ciclo elegible más antiguo y el crédito correcto». El detalle muestra Modalidad: ownbow y Ubicación: Absolute Archery Academy, sin la sede y dirección que sí conoce la agenda.

Ubicación: `app/reservar/page.tsx:128`, `app/reserva/[id]/page.tsx:147`.

Recomendación: usar lenguaje de clases y reservas; traducir modalidades. Mostrar sede real, dirección y motivo de cancelación de forma consistente con Mis reservas.

### P2 — Historial poco manejable y navegación inconsistente

Mis reservas carga 76 tarjetas sin paginación ni filtro por mes/estado: unos 12.620 px de página en móvil. Mi membresía presenta otro historial de 10 en 10 y con filtros locales. La barra inferior no tiene Mis reservas y marca Inicio cuando se visita esa ruta.

Ubicación: `app/mis-reservas/page.tsx:56`, `components/StudentBottomNav.tsx:43`.

Recomendación: entrada persistente a Mis reservas; separar próximas e historial con filtros en servidor y paginación consistente. Distinguir historial de clases y estado del plan.

## Mejoras visuales y de accesibilidad

- El inicio dedica el primer pantallazo a perfil y cuatro métricas; el CTA principal queda después de ese bloque, aunque existe el acceso inferior Reservar. Compactar identidad/plan y priorizar próxima clase, saldo/vencimiento y reserva. Mantener una acción principal clara.
- Escritorio mantiene un contenedor de 430 px dentro de 1440 px. Es una decisión móvil, no un fallo de integridad. Para una versión profesional de escritorio: ancho adaptable con resumen y agenda/historial en columnas.
- Login: etiqueta del código sin asociación explícita al input y botón de volver sin nombre accesible. Agenda y detalle contienen dos h1; agenda anida main dentro de main. Corregir semántica, nombres accesibles y estados activos de navegación.

## Lo que funcionó en esta revisión

- Ingreso con la cuenta autorizada y restauración de navegación.
- Saldo actual coherente: 6 disponibles de 16, 10 usadas y vencimiento 25/10.
- Agenda de Tiabaya con horarios, distancia, equipo y cupos; navegación entre semanas.
- Mis reservas distingue próximas/historial y muestra motivo de cancelación cuando existe.
- En móvil no se observó desbordamiento horizontal general; el problema de lectura está en campos truncados.
- Intentar abrir /admin con esta cuenta redirige al inicio del alumno. Es una comprobación puntual de interfaz, no una auditoría completa de autorización/RLS.

## Orden recomendado

1. Totales/filtros del historial y elegibilidad por fecha.
2. Error/no encontrado y resumen de confirmación de reserva.
3. Renovación, contacto y navegación a Mis reservas.
4. Lectura móvil, textos, sede/dirección, jerarquía del inicio y adaptación de escritorio.

## Evidencia y límites

Capturas privadas en output/student-ux-audit/: home-mobile.png, booking-mobile.png, booking-after-expiry-mobile.png, membership-initial-mobile.png, membership-count-changed-mobile.png, membership-clipped-plan.png, membership-desktop.png, booking-detail-mobile.png y booking-not-found-desktop.png. No se versionan imágenes del alumno ni credenciales. membership-clipped-plan.png no contiene identidad y permite revisar el truncado.

No se verificó confirmación/cancelación efectiva de una reserva, modificación de datos, envío de renovación, cuentas con otros saldos/planes, modo sin conexión, instalación PWA o rendimiento en un teléfono físico. Los hallazgos de oferta de reserva y confirmación inmediata incluyen evidencia de UI/código; no prueban el resultado de una operación que no se ejecutó. No se modificó código de la aplicación ni datos de negocio.
