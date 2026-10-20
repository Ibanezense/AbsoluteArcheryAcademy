# Mi progreso: verificación de Controles

Fecha: 19 octubre 2026, America/Lima. Alcance: entrega 1 del plan. La entrega 2, Competencias, conserva su alcance y espera la aceptación de Controles.

Actualización: el piloto local real quedó verificado tras las autorizaciones del usuario. Estado y evidencia en [piloto local](2026-10-19-student-progress-local-pilot.md). Las referencias a activación pendiente más abajo describen el estado previo a esa autorización.

## Implementación preparada

- Entrada desde Inicio y ruta `/mi-progreso`, con los cuatro accesos inferiores existentes y sin marcar otro como actual.
- Resumen de último control válido y mejores marcas independientes de 36 y 72 flechas; todos los intentos, anulaciones, filtros inclusivos y diez filas por página.
- Distancia asignada releída bajo permisos; discrepancias y orden deportivo incierto señalados. Sin asignación se muestra el último registro como histórico, sin asignar su distancia.
- Tutores consultan al alumno seleccionado y pueden cambiarlo. Cuenta, alumno y revisión separan las consultas y se descartan respuestas antiguas.
- Un panel de vinculación en la ficha administrativa: búsqueda, vista previa, evidencia, confirmación, reemplazo y revocación auditados. Revisar distancia lleva al editor deportivo existente.
- Lector privado en `D:/WEB ABSOLUTE ARCHERY`, contrato `academy-student-controls-v1`, schema y ejemplo sintético en su carpeta `docs/contracts/`. Incluye identidades privadas y todos los intentos, con límite explícito; no publica un directorio abierto.

## Evidencia local

- Revisión independiente de origen, permisos, API, caché y pantallas; hallazgos de fechas imposibles, histórico sin asignación y cambio de alumno corregidos y revisados.
- Suite general PWA: 170 archivos y 891 pruebas aprobadas, incluidas la regresión de tamaño inicial de gráfica y las nueve comprobaciones del runner de concurrencia.
- TypeScript, lint y compilación de producción aprobados después de los últimos cambios.
- SQL PGlite: 26 comprobaciones de permisos, exclusividad, revisión, auditoría y reversión atómica.
- PostgreSQL 17.6 aislado en loopback: tres carreras reales y 20 comprobaciones aprobadas por implementador y revisor principal. Se observó espera de bloqueo; dos alumnos no obtienen la misma identidad; dos reemplazos con la misma revisión y un reemplazo frente a revocación producen un éxito y un conflicto. Las auditorías corresponden exactamente a las transiciones confirmadas.
- Web de controles: `test:academy` aprobado nuevamente por el revisor principal. Implementador verificó también lint, tipos y compilación completa del origen.
- Navegador: componentes reales con datos sintéticos, en escritorio y viewport de 390 × 844. Distancia y formato cambian gráfica/historial conservando el resumen; ambos formatos mantienen escalas 360/720. Anulados excluidos de gráfica, presentes en historial; página 2 y vuelta a página 1 al filtrar. Rango desde/hasta 23 octubre devuelve exactamente el intento del día 23. Sin desbordamiento horizontal.
- Panel administrativo en navegador con transporte simulado local: evidencia sin casilla mantiene la confirmación deshabilitada; cancelación conserva pendiente; confirmación explícita muestra ID/revisión; retirada vuelve a pendiente. Ninguna de esas acciones accede a las bases reales.
- Runtime de producción local con interruptor ausente: página y API del alumno responden 404; API administrativa anónima 401. Respuestas privadas sin caché.

Las capturas y los transportes de prueba permanecen en `output/student-progress-preview/`, fuera del entregable de producción. La vista usa fuentes de sistema como sustituto de las fuentes que carga Next.js; no representa una publicación real ni un piloto de identidad.

## Activación pendiente

La migración `20261020033416_student_progress_links.sql` está preparada y probada, sin aplicar a la academia. No se crearon vínculos reales ni se copiaron puntajes. El lector de la web está preparado, sin desplegar; no se generó ni configuró su credencial real.

El plan aprobado reserva la aplicación a la base real y los despliegues para autorización expresa. La activación requiere aplicar esa migración, publicar el lector privado y configurar su credencial exclusiva entre ambos servidores. `STUDENT_PROGRESS_ENABLED` permanece desactivado por defecto. Después se verificará una identidad piloto confirmada por administración; esa comprobación cierra 1F y permite iniciar Competencias. La web no tiene repositorio Git: revisar y respaldar su paquete de publicación antes de desplegarla, preservando los cambios existentes.

## Ejecución final

- `npm test`: 170 archivos, 891 pruebas, cero fallos.
- `npm run lint`: salida 0.
- `npm run build`: salida 0; `/mi-progreso` y ambas APIs privadas compiladas como rutas dinámicas. Aviso existente de catálogo Browserslist desactualizado; no bloquea la compilación ni se cambiaron dependencias por ese aviso.
- `node tests/supabase/runStudentProgress.mjs`: 26 comprobaciones aprobadas.
- Runner PostgreSQL: tres carreras y 20 comprobaciones aprobadas en la base sintética marcada. Cluster aislado apagado al terminar.
- `npm run test:academy` en la web: aprobado; contrato y ejemplo contrastados contra el lector.
