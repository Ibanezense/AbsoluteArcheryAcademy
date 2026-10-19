# Validación del rediseño administrativo

Fecha: 18 de octubre de 2026. Base: `c619daa`. Rama: `codex/admin-ux-audit`.

## Entrega y entornos

Implementación en un checkout separado. El checkout original y sus archivos locales se conservan. No se ha publicado, aplicado migraciones ni modificado reservas, alumnos, membresías o pagos para verificar estas pantallas. La sesión local consulta la base configurada; las comprobaciones del navegador se limitan a lectura, navegación y formularios sin guardar.

| Entrega | Estado |
|---|---|
| T001: línea base y contratos | Documentados en los dos archivos de QA complementarios. |
| T002–T004: asistencia completa, población y semana | Implementados y probados con Vitest; lectura real contrastada. RPC aditiva preparada, todavía sin aplicar. |
| T005–T009: componentes, navegación, inicio, reserva y ficha | Implementados; comprobación visual y de navegación local. |
| T010–T013: membresías, asistencia, pruebas y finanzas | Implementados; pruebas automatizadas y revisión local. |
| T014–T015: validación y candidato | Código preparado. Permanecen pendientes las comprobaciones SQL y escrituras de negocio en una base desechable, la matriz completa de accesibilidad y la publicación autorizada. |

## Cambios comprobables

- Inicio prioriza Hoy, pendientes y agenda. Los resultados mensuales y la disponibilidad semanal completa se despliegan a petición. Se retiraron la campana sin acción y las series decorativas sin datos.
- Los atajos de pruebas pasadas e inasistencias conservan su periodo en Seguimiento; los vencimientos abren la lista filtrada. Reprogramar mantiene al administrador en su recorrido.
- Última asistencia lee todo el historial paginado cuando no existe la nueva RPC. El fallback solo responde a función inexistente; no oculta errores de acceso ni de red. La lectura real devolvió 59 alumnos con asistencia.
- Se impide guardar respuestas fallidas en la caché estática y se reintentan errores previamente almacenados; tres pruebas ejecutan el service worker real en un contexto aislado.
- La reserva móvil tiene tres pasos, conserva foco y admite Escape. Cambiar alumno o fecha descarta un turno incompatible; una fecha vacía no dispara una consulta inválida. El envío tiene bloqueo de duplicación.
- Ficha muestra cuatro indicadores y pestañas accesibles. Reserva y renovación parten del alumno abierto.
- Membresías abre el formulario a petición; distingue valor de ciclos creados de cobros. Finanzas lee todas las páginas del reporte, muestra 25 filas por página y exporta el conjunto filtrado.
- El alcance visual se limita al administrador. Se mantienen las reglas de ciclos, recursos y consumo por asistencia.

## Comparación de pantalla

Datos observados el mismo día a 390 × 844; las cantidades operativas pueden cambiar durante la jornada. No se comparan tiempos de tarea porque no existía una medición inicial.

| Medida | Antes | Después |
|---|---|---|
| Inicio del bloque Hoy | 3206 px aprox. | 314 px aprox. |
| Altura del inicio | 11564 px aprox. | 5897 px aprox. |
| Reserva: ancho contenedor/contenido | 334 / 396 px | 373 / 373 px |

Escritorio 1440 × 1000: documento 1425 px y contenido 1425 px, sin desbordamiento horizontal. Capturas privadas en `output/admin-ux-after`, excluidas de Git.

## Recorridos observados en navegador

| Recorrido local | Resultado |
|---|---|
| Inicio → Pruebas pasadas | 27 registros, coincide con el indicador; periodo conservado y sin desbordamiento a 768 px. |
| Inicio → ficha | Carga el alumno elegido y sus cuatro indicadores. |
| Lista → última asistencia | Fecha del día 18 visible y coherente con el registro de asistencia observado. |
| Reserva → alumno → fecha → cerrar y reabrir | Reapertura en el primer paso, selección anterior descartada; sin escritura. |
| Ficha → renovar | Alumno preseleccionado; apertura y desplazamiento al formulario. No se confirma la venta. |
| Más → Pruebas | Día seleccionado por defecto a 360 px; sede y filtros accesibles. |
| Más → Finanzas → Siguiente | 36 movimientos en dos páginas en la lectura final; el total permanece. Las cifras cambiaron durante la auditoría por actividad externa. |
| Turnos → Pasar asistencia | Conserva 18 de octubre y sesión 10:00 de Tiabaya; aparece el turno correcto seleccionado. |
| Más → Escape | Se cierra el menú y el foco vuelve al botón Más. |

Ficha, Pruebas, Finanzas y Turnos no presentaron desbordamiento a 360 × 800 en las lecturas comprobadas. La ficha situó las pestañas en y=763 px. El formulario de renovación quedó con 345/345 px de contenedor/contenido a 360 × 800 y 753/753 px a 768 × 1024. El alumno preseleccionado aparece a y=612 px después de abrir el enlace; el aviso conserva contraste sobre fondo oscuro.

## Pruebas automatizadas

- Suite completa: 141 archivos, 726 pruebas aprobadas, cero fallos. Incluye historias superiores a 1000 registros, errores de lectura, rangos civiles, filtros, reapertura de reserva y paginación financiera.
- ESLint: aprobado.
- TypeScript y compilación de producción: aprobados.
- Las comprobaciones que inspeccionan código fuente acreditan estructura; no sustituyen pruebas de interacción.
- Revisión independiente: se corrigieron los destinos históricos, el foco de navegación móvil cerrada y el aviso de error de alumnos en la reserva preseleccionada.

## Pendientes antes de publicar

1. En una base desechable, aplicar `20261018234605_admin_last_attendance_summary.sql` y ejecutar `tests/supabase/adminLastAttendance.integration.sql` y `adminDashboardMetrics.integration.sql`. Los scripts transaccionales revierten sus datos de prueba. No se han ejecutado contra producción.
2. Validar con usuarios admin/alumno/tutor y comprobar escrituras: reservar y reintentar sin duplicado, renovar sin alterar ciclos previos, marcar/revertir asistencia, reprogramar prueba y recargar. No se certifican estos recorridos con una captura de solo lectura.
3. Completar teclado, lector de pantalla, zoom real al 200 % y navegador móvil físico. La revisión de tamaño adaptable no equivale a estas comprobaciones.
4. Publicar únicamente con autorización del usuario, registrar URL y revisión y verificar allí navegación, lecturas, permisos e invalidaciones.

## Publicación y reversión

La migración añade solo una función de lectura protegida para administradores. No cambia tablas ni datos. El frontend nuevo funciona sin ella mediante paginación; el anterior puede seguir funcionando después de aplicarla. Probar permisos y resultado antes de promover el frontend.

Para revertir presentación, volver al frontend anterior sin borrar historial ni repetir escrituras. La función de lectura puede permanecer; si se necesita retirarla, hacerlo con una nueva migración revisada que revoque permisos y elimine únicamente esa función. Conservar registros operativos y capturas privadas fuera del repositorio.
