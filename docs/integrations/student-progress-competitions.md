# Mi progreso: integración privada de Competencias (entrega 2)

Estado al 20 de octubre de 2026: implementación preparada y probada localmente; migración y credenciales nuevas sin aplicar/configurar en la academia. No se crearon vínculos TE reales, publicaron servicios ni alteraron resultados deportivos.

## Contratos y transporte

La PWA utiliza exclusivamente el consumidor `academy` y el namespace `academy_reservas_student`. No reutiliza consumidores, bridges ni credenciales AS/AP.

- Lector: `GET /api/v1/consumer?consumer=academy&operation=history&competitor_id=…&external_id=…[&after=…]`.
- Dataset: la misma ruta con `operation=dataset&dataset_version_id=…`, conservando ambos identificadores. La respuesta de transporte es exactamente `{dataset_version, payload}`; se comprueba que la versión exterior coincida con la del payload y con el catálogo antes de usarlo.
- Identidad: `/api/v1/academy-identity`, con credencial separada. `search`, `preview` y `status` son GET; `confirm` y `revoke` son POST con `request_id`, sujeto, actor, evidencia y `generation`.
- El consumidor comprueba los cuatro schemas JSON versionados mediante Ajv 2020 y formatos estrictos, sin coerción, defaults ni eliminación silenciosa de propiedades. Comprueba además identidad, pertenencia de participaciones, referencias, IDs duplicados y coherencia de versiones. Nunca infiere puntajes, formatos, flechas o posiciones.

Las copias de `lib/contracts/*.schema.json` son idénticas a sus archivos de `D:/Tournament Engine/contracts` durante esta entrega. SHA-256:

| Archivo | SHA-256 |
| --- | --- |
| `academy-individual-progress-v1.schema.json` | `421E646212051561346F8989114D712F2D099D6934AE8D8DA758BF5CB1F631BD` |
| `academy-individual-progress-history-v1.schema.json` | `60F03A20B09248436F7213A4A58AEE38AC0313C726DDEB8BC7D61E4A4CCAC62F` |
| `academy-identity-v1.schema.json` | `201B7F79BB41B5497B725BFF23A0FD0A965710130CF18A3A2DFEF23197F368A6` |
| `academy-identity-command-v1.schema.json` | `FDC9FC80AB61A5675A70BBE481AFD32DB9D540B637784B8F6474616829734F39` |

Una modificación del contrato requiere revisar y actualizar estas copias de forma deliberada. Los componentes del navegador solo importan los tipos de `studentCompetitions.ts`; el validador queda en el servidor.

## Configuración futura de servidor

- `STUDENT_PROGRESS_COMPETITIONS_ENABLED=true`: habilita la ruta del alumno; ausente o cualquier otro valor devuelve 404 privado antes de acceder a TE. Controles conserva su interruptor independiente.
- `TOURNAMENT_ENGINE_URL`: origen HTTPS del TE. Solo se admite HTTP a localhost en desarrollo. No se aceptan credenciales, query ni fragmentos en la URL; las rutas se fijan en servidor y no se siguen redirecciones.
- `TOURNAMENT_ENGINE_ACADEMY_TOKEN`: coincide con el token lector `TE_ACADEMY_API_TOKEN` en TE.
- `TOURNAMENT_ENGINE_ACADEMY_IDENTITY_TOKEN`: coincide con `TE_ACADEMY_IDENTITY_TOKEN` en TE. Debe ser distinto del lector; cada token necesita al menos 32 caracteres sin espacios exteriores.
- `SUPABASE_SERVICE_ROLE_KEY`: clave de servidor existente, utilizada únicamente para llamar al finalizador mutador descrito a continuación. No se emplea para leer alumnos, vínculos, permisos ni resultados.

No colocar estas credenciales en variables públicas, URLs, respuestas, logs o archivos versionados. Configurar la entrega no implica habilitarla ni confirmar personas.

## Identidad local, decisión humana y canal de finalización

La migración aditiva `20261020151351_student_progress_competitions_links.sql`, generada con Supabase CLI, convierte `external_id` a texto. Mantiene las firmas UUID de las RPC de Controles y sus comparaciones con cast explícito; conserva su exclusividad y permite varios IDs TE por alumno.

Cada par alumno–competidor TE conserva una fila estable. `revision` es la generación monotónica de ese par, incluso después de revocar y volver a confirmar. La identidad externa queda reservada mientras el vínculo está pendiente o confirmado, con unicidad transaccional entre alumnos.

La decisión humana se registra una vez en `student_progress_link_operations`, con `id=request_id`, intención/evidencia inmutables y auditoría. La petición repetida con el mismo ID e intención devuelve la misma operación; otra intención con el mismo ID produce conflicto. Un reintento utiliza `operationId` y no requiere volver a confirmar la decisión.

Las RPC del actor autenticado crean solicitudes pendientes, reclaman un lease de 45 segundos, verifican el lease y registran fallos seguros. **Ninguna RPC ejecutable por `authenticated` puede pasar un vínculo TE a confirmado.** La revocación local pasa inmediatamente a `revoked` e invalida acceso/caché antes de contactar TE; la limpieza remota puede continuar pendiente.

El finalizador `server_finalize_engine_operation` tiene EXECUTE exclusivamente para `service_role` y está revocado a PUBLIC, anon y authenticated. La API valida primero JWT con `auth.getUser`, perfil administrador activo, contexto del alumno, lease y estado local. Consulta el estado canónico de TE y comprueba sujeto, namespace, request ID, acción y generación aplicada. Solo entonces crea el cliente mutador del servidor y llama a esa RPC. SQL vuelve a comprobar administrador activo, lease, revisión, estado y campos vinculantes de la prueba; actualiza vínculo y auditoría atómicamente.

Este uso restringido de la clave existente evita que un administrador desde el navegador fabrique una prueba para confirmar localmente un bridge inexistente. No usa service role como sustituto de autorización. El cliente mutador no tiene ninguna ruta de lectura o decisión de permisos en la implementación.

## Fallos, reintentos y fencing

Antes de reenviar un comando siempre se consulta su estado por request ID. Si el POST se confirmó remotamente pero se perdió su respuesta, una nueva consulta de estado recupera la misma operación. Si el finalizador local está temporalmente inaccesible, la decisión permanece pendiente; el administrador puede reintentar sin crear otro vínculo.

TE conserva la generación de revocación como tombstone. Una confirmación anterior que llegue tarde no puede reactivar un bridge revocado con una generación mayor. Localmente, revocar también marca las confirmaciones pendientes anteriores como superseded; un finalizador tardío queda rechazado por lease/CAS/generación.

La misma API administrativa entrega errores 409 para conflictos de revisión o identidad. Los fallos temporales posteriores a registrar la decisión devuelven su estado pendiente, con `last_error_code` seguro, y no un falso confirmado. Lease activo de otra solicitud deja la operación pendiente; no se envía un segundo comando concurrente.

## Lectura, completitud y caché

La ruta privada del alumno valida sesión, perfil y relación antes de fuente o caché y vuelve a comprobar el conjunto completo de vínculos confirmados después de la lectura, incluidos cache hits. Un bridge remoto huérfano sin vínculo local confirmado no concede acceso desde la PWA.

El lector recorre todas las páginas de history, detecta cursores repetidos y deduplica por IDs canónicos. Un dataset/version retirado mientras se consulta provoca una única relectura del catálogo; reemplaza la proyección anterior completa. Si dos identidades devuelven versiones contradictorias del mismo dataset, vuelve a leerlas una vez y, si la contradicción persiste, excluye ese dataset e informa cobertura parcial. Un error de catálogo no equivale a una retirada.

Límites operativos deliberados: 20 páginas de history por identidad (100 filas cada una), hasta 50 vínculos por respuesta, cuatro tareas simultáneas, ocho segundos por solicitud y 25 segundos de presupuesto compartido por lectura del alumno. Cada cuerpo está limitado a 8 MB. Alcanzar un límite produce parcial/no disponible; nunca una falsa consulta completa vacía.

Solo se cachean lecturas completas durante cinco minutos, con máximo de 100 entradas por proceso, identificadas por contrato, vínculo, ID externo y revisión. Una caché vencida no entrega puntajes antiguos como actuales; únicamente puede conservar la última comprobación conocida. Cada respuesta al navegador es `private, no-store`, con `Vary: Authorization`. Controles y Competencias usan llamadas, cachés e interruptores independientes.

## Verificación y reproducción aislada

```powershell
npx vitest run lib/server/studentProgress
node tests/supabase/runStudentProgressEngine.mjs
npx tsc --noEmit
```

El segundo comando usa PGlite efímero y comprueba 36 casos de SQL: alumno/tutor/ajeno/anónimo, administrador inactivo, pending sin acceso, múltiples IDs TE, exclusividad, lease, prueba falsa y finalizador denegado al navegador, revocación inmediata, generación tardía y compatibilidad de Controles.

Para PostgreSQL 17.6 nativo, reutilizar exclusivamente el cluster sintético descrito en `student-progress-controls.md`. El preparador compara su directorio exacto y solo reinicia la base marcada `codex_student_progress_test` en loopback:55439. Cada runner requiere la base sintética vacía:

```powershell
node tests/supabase/prepareStudentProgressConcurrency.mjs --reset-test-database
node tests/supabase/runStudentProgressEngine.mjs 'postgres://codex_progress_test:codex-local-test-only@127.0.0.1:55439/codex_student_progress_test'
node tests/supabase/prepareStudentProgressConcurrency.mjs --reset-test-database
node tests/supabase/runStudentProgressEngineConcurrency.mjs 'postgres://codex_progress_test:codex-local-test-only@127.0.0.1:55439/codex_student_progress_test'
```

Ambas pruebas nativas pasaron: 36 comprobaciones SQL y tres carreras con bloqueo observado en `pg_stat_activity`, más 14 comprobaciones. Las carreras cubren la misma identidad externa para dos alumnos, dos confirmaciones de la misma revisión y revocación frente a finalización atrasada. En esta última, el vínculo queda revocado y el finalizador pierde con conflicto; la auditoría coincide con las transiciones confirmadas.

No ejecutar fixtures, inicializadores ni runners de reinicio sobre la base de la academia. Antes de publicación faltan revisión/aceptación conjunta, aplicación autorizada de ambas migraciones, configuración privada y despliegues autorizados, prueba de ambas fuentes publicadas y confirmación humana de identidades piloto. No se declara probado un recorrido publicado con credenciales o vínculos TE reales.
