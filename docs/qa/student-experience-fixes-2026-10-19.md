# Correcciones de experiencia del alumno — 19 octubre 2026

Implementación del informe `student-experience-audit-2026-10-19.md`, conservando las reglas de negocio. Frontend local en la rama `codex/admin-ux-audit`; sin publicación de frontend.

## Cambios verificados

- Historial compartido entre Mis reservas y Membresías, filtrado por mes/estado en servidor y páginas de diez. Los totales no dependen de la página cargada.
- Uso del plan separado del historial completo. En la cuenta autorizada: 6 disponibles, 10 usadas, 2 canceladas del plan y 0 inasistencias. El historial completo contiene 76 eventos, 66 asistidas y 10 canceladas. El contador del plan permanece en 2 al visitar la página dos.
- Agenda consulta elegibilidad por fecha, cuotas, compromisos, recuperaciones, congelamiento, capacidad/equipo, corte y estado operativo protegido. Los nueve turnos de 29 octubre a 1 noviembre aparecen deshabilitados por falta de membresía vigente, con acceso a renovación. Los turnos de la semana vigente conservan la oferta de reserva.
- Reservar abre confirmación con alumno, sede, fecha, hora y tipo de crédito. El texto distingue comprometer una clase de descontarla por asistencia. Abrir y cerrar con Escape no crea una reserva.
- Detalle inexistente muestra “Reserva no encontrada” y salida a Mis reservas. Detalle real muestra Tiabaya, modalidad traducida y motivo de cancelación. No se inventa dirección si la sede no la tiene configurada.
- Renovación manual disponible sin alerta de última clase; carga cuatro paquetes canónicos. La intención de apertura se conserva mientras termina de cargar el contexto del diálogo. Se mantiene validación administrativa y el flujo de pago existente. Consulta pendiente visible y errores recuperables.
- Soporte usa exclusivamente el WhatsApp confirmado por el usuario: `https://wa.me/51997224472`. Se inspeccionó el destino; no se envió ningún mensaje.
- Navegación incluye Mis reservas y activa esa sección en los detalles. Inicio compacto y botón de reservar antes de las métricas. Plan y fechas sin truncado. Contenedor de escritorio de 1120 px a 1440 px de viewport; comprobación móvil a 390 px y 320 px sin desbordamiento horizontal en Membresías. Un h1 en cada pantalla revisada. Login tiene label asociado y botón Volver nombrado.
- Diálogos conservan el foco, permiten Escape, recorren controles con Tab y restauran el foco al cerrar. Tras reservar/cancelar, las superficies de agenda, historial, detalle, dashboard, semana y próxima reserva se invalidan juntas.
- “Mi semana” describe `weekly_completed` como cupos normales ocupados, porque incluye reservas e inasistencias además de asistencias.

## Base real

El usuario autorizó expresamente activar las consultas. Se aplicaron:

- `20261019201808_student_filtered_booking_history.sql`
- `20261019201815_student_booking_agenda_and_detail.sql`

Son funciones adicionales; no cambian el RPC que ejecuta reservas ni actualizan registros de negocio. Lectura real con contexto de tutor autorizado confirmó los totales y los nueve turnos no elegibles. Los recuentos antes y después del recorrido permanecieron en 1455 reservas, 196 membresías y 3 solicitudes de renovación.

La revisión de seguridad marca las tres funciones como SECURITY DEFINER accesibles a authenticated. Es intencional: verifican acceso al alumno con el helper canónico, fijan search_path y revocan EXECUTE a PUBLIC/anon. Roles ajenos y anónimos se prueban en PostgreSQL aislado. Referencia del aviso: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable. No se modificaron avisos históricos ajenos al alcance.

## Validación

- Suite completa: 155 archivos, 809 pruebas aprobadas.
- TypeScript, ESLint y compilación de producción aprobados.
- PostgreSQL aislado: `node tests/supabase/runStudentBookingHistory.mjs` y `node tests/supabase/runStudentBookingAgenda.mjs` aprobados. Runtime opcional PGlite 0.5.10 fuera de los archivos versionados.
- Revisión independiente de SQL y frontend; corregidos estados inactive, claves de caché, jerarquía y descripción de cupos semanales.
- Recorrido real sin confirmar operaciones: membresía, paginación, filtro de canceladas, renovación, agenda vigente y posterior al vencimiento, confirmación, detalle válido e inexistente, inicio y navegación.

Capturas privadas en `output/student-ux-audit/`: `student-membership-fixed-mobile.png` y `student-agenda-expiry-fixed.png`. No se versionan fotografías, datos de acceso ni capturas identificables del alumno.

## Límites

No se crearon/cancelaron reservas reales ni se enviaron renovaciones para probar. Las escrituras mantienen sus RPC anteriores y su validación atómica; la confirmación visual y la sincronización de caché se revisaron en código. No se probó instalación PWA, un teléfono físico ni operación sin conexión. No se publicó el frontend.
