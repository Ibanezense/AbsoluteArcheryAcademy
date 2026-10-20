# Mi progreso: Competencias, verificación previa al piloto

Fecha: 20 octubre 2026, America/Lima. Implementación preparada en el worktree `codex/admin-ux-audit`. Competencias permanece desactivado; no se aplicaron sus migraciones reales, crearon credenciales, confirmaron identidades ni publicaron cambios.

## Resultado verificable

- PWA: 949 pruebas en 178 archivos aprobadas; ESLint, TypeScript y compilación de producción aprobados.
- SQL aislado: 36 comprobaciones aprobadas sobre PGlite y PostgreSQL 17.6 nativo. El revisor repitió las 36 de PGlite.
- Concurrencia nativa repetida por el integrador: tres carreras con bloqueo observado y 14 comprobaciones aprobadas. Exclusividad entre alumnos, misma revisión concurrente y revocación frente a finalización atrasada.
- TE: 70 pruebas aprobadas en la repetición completa, contratos e integración AS/AP incluidos. Lint y tipos dirigidos a archivos de esta entrega aprobados; comprobación de secretos aprobada. La primera ejecución tuvo un fallo nativo transitorio de libSQL; su prueba aislada y la repetición completa pasaron.
- Lint y tipos globales de TE conservan errores en archivos ajenos a esta entrega (scripts de respaldo/publicación y pruebas anteriores). No se declara aprobado el chequeo global ni se incluyeron arreglos ajenos. Respaldos y manifiesto privado permiten identificar los 21 archivos de la entrega.
- Revisiones independientes de origen TE, presentación PWA y backend PWA cerradas sin hallazgos materiales pendientes.

## Correcciones comprobadas durante la revisión

El transporte real de TE envuelve el resultado en `{dataset_version,payload}`. La PWA extrae y valida el payload, su versión exterior y el ID de versión solicitado; pruebas rechazan discrepancias. Las bajas incluidas en el snapshot vigente conservan efecto aunque su `effective_dataset_version_id` corresponda a una versión anterior; no se rechaza toda la respuesta ni reaparecen puntajes retirados.

El proyector también oculta participaciones de un competidor retirado, diferencia el estado de participación del estado del resultado final y explica el vacío posterior a bajas. Los resultados sin datos de clasificación o posición no reciben valores inventados.

## Recorridos interactivos

Prueba local con componentes reales y transporte sintético, sin escribir en sistemas reales:

| Recorrido | Evidencia observada |
| --- | --- |
| Búsqueda, vista previa y cancelación | Eventos/categorías visibles; cancelar conserva cero vínculos y no envía `beginConfirm` |
| Decisión aceptada, origen no disponible | Fila pendiente y reintento de la misma operación, sin volver a confirmar identidad |
| Reintento | Identidad verificada, sin segundo diálogo humano |
| Retiro y limpieza pendiente | Acceso retirado de inmediato, revisión incrementada y limpieza pendiente visible; reintento completa la limpieza |
| Respuesta perdida después de aceptar | GET recupera la operación persistida y ofrece reintento; se retira la vista previa para evitar una segunda decisión |
| Alumno: cambio de fuente | Controles por defecto; Competencias muestra historial independiente |
| Fuente parcial o no disponible | Mensaje explícito; resultados parciales identificados y Controles sigue disponible |
| Teclado y tamaño móvil | Cambio de pestaña con flechas y presentación a 390 px comprobados |

Capturas sintéticas y regresión real conservadas en `output/competitions-preview/`, fuera de Git. El harness reemplaza identidad/transporte y el encabezado de navegación; no prueba por sí solo autenticación ni la conexión real a TE. Esas garantías tienen pruebas de API/SQL y requieren además el piloto autorizado.

Se volvió a abrir la app real local con la cuenta del piloto de Controles: las marcas existentes y sus formatos permanecen correctos, sin pestaña de Competencias. La ruta de Controles respondió 200. Los servidores locales vuelven a escuchar en loopback 3100 y 3102.

## Activación pendiente y alcance

1. Obtener autorización para aplicar únicamente la migración PWA `20261020151351_student_progress_competitions_links.sql` y la nueva migración TE `0006_academy_identity.sql`, y configurar la conexión privada local. Verificar antes el historial de migraciones y conflictos de namespace; no ejecutar un lote de migraciones ajenas.
2. Respaldar metadatos afectados, aplicar los cambios autorizados y comprobar RLS/permisos, conservación del vínculo Controles y ausencia de vínculos TE nuevos automáticos.
3. Configurar dos credenciales exclusivas servidor a servidor, fuera de Git; habilitar Competencias solo en desarrollo local.
4. Buscar y presentar candidatos con IDs/eventos; solicitar confirmación humana del registro exacto antes de vincular cualquier persona. Verificar alumno → PWA → permisos → TE y contrastar resultados con la fuente.
5. Publicación pública de cualquiera de las aplicaciones requiere autorización separada y resolución del alcance del checkout TE con cambios previos. El piloto no la autoriza.

Reversión prevista: desactivar únicamente Competencias; conservar auditoría, bajas y generaciones, sin cambiar Controles ni resultados deportivos de origen. La funcionalidad completa no se considera aceptada con datos reales hasta completar el piloto de Competencias y la publicación autorizada que corresponda.
