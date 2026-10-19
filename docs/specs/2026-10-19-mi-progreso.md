# Spec: Mi progreso

Fecha de inspección y ajuste: 19 de octubre de 2026, America/Lima. Estado: diseño ajustado tras revisión; funcionalidad no implementada. Base de la PWA inspeccionada: `cea6da3`, rama `codex/admin-ux-audit`.

## 1. Objetivo y alcance inicial

Permitir al alumno y a su tutor consultar sus controles de entrenamiento, resultados de competencias y evolución deportiva desde la PWA, sin volver a registrar puntajes. La web de la academia conserva la autoridad sobre controles; Tournament Engine (TE), sobre competencias; la PWA conserva alumnos, permisos y distancia asignada.

La funcionalidad completa conserva ambas fuentes. Se entregará en dos incrementos verificables:

1. **Entrega 1 — Controles completa:** vínculo PWA–registro de controles, resumen deportivo, gráfica, historial completo y filtros, con todos sus estados y pruebas de identidad/permisos. Puede publicarse sin credenciales, bridges, rutas o disponibilidad de Tournament Engine.
2. **Entrega 2 — Competencias:** ampliar la misma página y ficha administrativa para vincular y consultar TE. Mantener controles funcionando durante su conexión y ante cualquier fallo de competencias.

La entrega 1 no incluye una pestaña de competencias deshabilitada ni mensajes de una fuente que aún no está habilitada. En la entrega 2 aparecen las dos secciones reales. Solo se permite leer resultados deportivos. No se condiciona el acceso a tener saldo o membresía vigente: se reutiliza la autorización sobre el alumno, sin añadir un requisito de compra.

Quedan excluidos objetivos técnicos, recomendaciones, AI Coach, rankings nuevos, cálculo de handicap/puntos compensados, carga manual de puntajes, extracción de Ianseo, sincronización de resultados hacia la liga, detalle de eliminatorias, exportaciones, notificaciones y modo sin conexión. Tampoco se incluyen equipos ni equipos mixtos en el MVP.

## 2. Hechos comprobados

### 2.1 Aplicación de reservas

- Workspace de trabajo: `C:/Users/OMEN/.codex/worktrees/admin-ux-audit/archery-reservas-pwa`. El checkout original `D:/PROGRAMACION/archery-reservas-pwa` no se modificó.
- Next.js App Router, Supabase Auth/PostgreSQL, React Query, Tailwind y Recharts ya forman parte de la aplicación.
- `students.id` identifica al alumno académico. `profiles.id` identifica la cuenta autenticada. `students.self_profile_id` y `student_guardians.guardian_profile_id` resuelven titular y tutor.
- `students.current_distance_m` existe en la base real y se entrega en `get_student_dashboard`. No es una distancia calculada a partir de competencias.
- `resolve_accessible_student_id(uuid)` comprueba sesión y acceso mediante `can_access_student`. Con tutor de varios alumnos exige selección explícita. El helper admite también administradores autorizados.
- Las consultas de metadatos no encontraron tablas públicas con nombres de progreso, bridges o enlaces externos, ni columnas de Engine/academia en `students`. No se identificó una vinculación existente que pueda reutilizarse entre estos tres padrones.
- La navegación inferior actual contiene Inicio, Reservar, Mis reservas y Membresías. No existe Mi progreso.

Evidencia local: `lib/hooks/useStudentContext.ts`, `lib/hooks/useStudentDashboard.ts`, `lib/supabaseClient.ts`, `app/api/admin/create-student/route.ts`, `supabase/migrations/20260227_create_v2_core_entities.sql`, `supabase/migrations/20260228_create_student_dashboard_rpcs.sql`.

### 2.2 Controles de la web: fuente correcta

Proyecto inspeccionado: `D:/WEB ABSOLUTE ARCHERY`. La fuente es el registro de **rankings de academia**, independiente de la liga mensual.

| Entidad existente | Campos verificados relevantes |
| --- | --- |
| `aa_academy_students` | `id`, `name`, `active`, `visible`, `revision`, `created_at`, `updated_at` |
| `aa_academy_controls` | `id`, `student_id`, `distance`, `arrows`, `score`, `performed_date`, `performed_time`, `status`, `revision`, `created_at`, `updated_at` |
| `aa_academy_audit` | Auditoría administrativa de correcciones/anulaciones; no se entrega al alumno |

- `arrows` admite 36 y 72; `score` está limitado a `arrows * 10`. Las distancias admitidas son 10, 15, 20, 30, 40, 50, 60, 70, 18 y 25 metros. El registro no tiene distancia actual del alumno ni datos de diana/división suficientes para inventar otras comparaciones.
- Los controles conservan distancia por intento. `performed_date` y `performed_time` representan fecha/hora deportiva de Lima; una hora desconocida permanece `null`.
- `status` es `valid` o `annulled`. Una corrección conserva el ID e incrementa `revision`; una anulación conserva la fila, cambia estado e incrementa revisión. `updated_at` se actualiza en ambos casos.
- `readAcademy` devuelve todos los intentos. `publicData` excluye anulados y alumnos no visibles; el ranking se calcula después. Por tanto, los intentos originales están disponibles sin extraer HTML ni utilizar solo la mejor marca.
- `GET /api/rankings` existe y devuelve controles válidos públicos, pero omite `status`, `revision` y `updated_at`. `GET /api/rankings/admin` devuelve datos administrativos y exige cookie administrativa de liga. No existe un endpoint privado de progreso por alumno.
- `visible=0` es privacidad pública, no ausencia de controles. No se debe interpretar la ausencia en la API pública como historial vacío ni reutilizar una cookie administrativa como credencial de integración.
- `aa_league_archers` y `aa_league_controls` pertenecen a otra funcionalidad. Sus formatos y puntos de liga no alimentarán Mi progreso.

Verificación de lectura real: cuatro tablas `aa_academy_*`; 36 alumnos y 110 controles válidos, de los cuales 95 son de 36 flechas y 15 de 72. La API pública respondió 200 con 32 alumnos y 110 controles, regla `AA-academy-personal-best-v1`. No había anulaciones en esta lectura; su comportamiento está comprobado en código, no mediante una anulación real.

Evidencia: `D:/WEB ABSOLUTE ARCHERY/db/academy.sql`, `lib/academy/model.ts:6`, `lib/academy/model.ts:16`, `lib/academy/store.ts:7`, `lib/academy/store.ts:51`, `app/api/rankings/route.ts`, `app/api/rankings/admin/route.ts`, `docs/RANKINGS-ACADEMIA.md`.

### 2.3 Competencias: Tournament Engine

Proyecto inspeccionado: `D:/Tournament Engine`. Turso/libSQL conserva entidades canónicas versionadas. `db/schema.sql` se declara antiguo; la estructura de referencia está en `db/migrations`, el contrato JSON y los lectores de `src/infrastructure`.

| Dato requerido | Fuente existente y relación |
| --- | --- |
| Evento y fechas | `tournaments`: `dataset_version_id`, `tournament_id`, `name`, `start_date`, `end_date`; objeto canónico `tournament` |
| Deportista | `competitors`: `competitor_id`, `identity_status`, `canonical_json`, dentro de una versión |
| Participación y categoría | `participations`: `participation_id`, `competitor_id`, `competitive_class_id`, `status`; `competitive_classes.canonical_json`: `label`, `event_type`, `division`, `age_class`, `gender` |
| Puntaje y flechas de clasificación | `qualifications`: `qualification_id`, `participation_id`, `score`, `arrow_count`, `rank`, `canonical_json` |
| Distancia | `qualification.segments[].distance_m`; para `data_level=total_only`, `qualification.distance_m`. La categoría no contiene una distancia canónica equivalente |
| Posición de clasificación | `qualification.rank`; alternativa explícita en `ranking_entries` con `ranking_type=qualification` |
| Posición final | `final_results.final_position` y `result_status`; existe también `ranking_entries` con `ranking_type=final` |
| Versionado | `dataset_versions`: `dataset_id`, `dataset_version_id`, `dataset_version`, `status`, `is_current`, `published_at` |
| Anulaciones/reemplazos | `tombstones`, relaciones de sustitución de versiones y selección de versión publicada actual |
| Enlace de identidad | `external_bridges`: `competitor_id`, `namespace`, `external_id`, `link_status`, `verified_at` |

API existente: `GET https://tournament-engine-snowy.vercel.app/api/v1/consumer`. Usa Bearer de servidor, `Cache-Control: private, no-store`, y solo admite consumidores `as` y `ap` con credenciales distintas.

- `consumer=ap&operation=catalog`: catálogo publicado actual, paginado por `after`, 100 elementos más detección de siguiente página. `operation=dataset` entrega `te-ap-public-competition-v1`.
- `consumer=as&operation=history`: exige `competitor_id`, `external_id` y bridge confirmado de namespace `as_athlete`. `operation=dataset` admite contratos `te-as-competition-mirror-v1/v2`; v2 incluye categorías. No constituye autorización para usar un UUID de reservas como atleta AS.
- Las versiones servidas deben ser `published` e `is_current=1`. Un snapshot contiene entidades de una versión, no un acumulado que deba anexarse ciegamente.
- `snapshot_id` se genera nuevamente en cada lectura del lector actual. La identidad de resultados debe apoyarse en IDs canónicos y versión, no en ese nonce ni en nombres.

Lectura real: 11 versiones publicadas actuales y dos sustituidas; solo tres bridges confirmados, todos `as_athlete`. Se comprobó 401 sin credencial y 200 del catálogo AP con credencial existente; también 200 de history y de un snapshot v2 para un bridge AS ya confirmado. Ese snapshot no tenía qualifications: la ausencia de clasificación no permite descartar por sí sola una participación.

En las versiones actuales se observaron 1526 qualifications: 1343 con `rank=null` y 33 con `arrow_count=0`. `ranking_entries` sí contiene posiciones explícitas de clasificación. Existe además un agregado `total_only`, a 25 m y sin segmentos. Estas observaciones justifican soportar datos incompletos y la alternativa explícita de clasificación; no justifican rellenar formatos o puestos.

**Enlaces de origen:** `source_references` contiene `source_system/source_key/source_file/source_row`, no un campo URL. Los registros inspeccionados usan referencias `csv-v1`; no se encontraron `source_key` con URL ni `tournament_metadata` en los manifiestos publicados. No hay un enlace reutilizable de Ianseo confirmado en el contrato entregado. El MVP ocultará el enlace si no existe uno explícito y verificable; no fabricará URLs a partir del nombre o ID interno.

Evidencia: `D:/Tournament Engine/api/v1/consumer.mjs`, `src/infrastructure/http/consumer-api.mjs:16`, `src/infrastructure/queries/libsql-read-model.mjs:56`, `db/migrations/0001_foundation.sql`, `contracts/tournament-engine-canonical-v1.schema.json`, `contracts/competition-mirror-snapshot-v2.schema.json`. El árbol local de TE tiene cambios previos sin confirmar; no se modificaron. Las comprobaciones remotas verifican las operaciones citadas, no la paridad completa entre todos los archivos locales y producción.

## 3. Decisión de integración propuesta

| Alternativa | Evaluación |
| --- | --- |
| APIs de servidor por alumno, con caché corta | **Recomendada.** Conserva autoridad en cada origen, evita una segunda base de puntajes y reutiliza el modelo de consumidores de TE. Requiere un lector privado de controles y un consumidor propio de reservas en TE |
| Sincronización persistente de resultados en Supabase | Ofrece disponibilidad sin cada origen, pero añade importadores, reconciliación, bajas, trabajos, auditoría, versiones y recuperación. No es necesaria para el volumen observado ni para el MVP |
| Lectura SQL directa con tokens Turso de solo lectura | Evita endpoints nuevos, pero acopla la PWA a dos esquemas y concede acceso de base más amplio que un lector deportivo. No se recomienda como contrato operativo inicial |

Flujo: navegador autenticado → API de la PWA → autorización del alumno → enlace confirmado → lector de la fuente → validación/proyección mínima → respuesta privada. En la entrega 1 solo se consulta entrenamiento. Al habilitar la entrega 2, las fuentes se solicitan por separado y en paralelo. La PWA solo persistirá vínculos y su auditoría; no una copia canónica de puntajes.

### Contratos nuevos necesarios: propuestas, todavía inexistentes

1. **Web:** lector privado `GET /api/integrations/student-controls?student_id=<id de aa_academy_students>`, contrato propuesto `academy-student-controls-v1`. Credencial exclusiva servidor a servidor. Entrega un snapshot completo del alumno solicitado con los campos de controles verificados, incluidos estado/revisión, y metadatos de completitud/consulta. Permite la lectura privada de su historial aunque no sea visible públicamente, tras confirmar expresamente esa política con el propietario de la web. No entrega auditoría, otros alumnos ni modifica la API pública.
2. **TE:** ampliar `/api/v1/consumer` con consumidor propuesto `academy`, credencial propia y namespace propuesto `academy_reservas_student`. Conservar history/dataset y paginación, sujetos limitados por bridge confirmado. Contrato nuevo propuesto `te-academy-individual-progress-v1`: evento, categorías, participaciones individuales, qualifications, posiciones, estado/versiones y bajas; omitir nacimiento, identificadores personales innecesarios, RAW y flechas de rivales. No renombrar ni alterar contratos AS/AP. El enlace de origen será opcional y solo estará presente si TE documenta una URL válida.
3. **PWA:** rutas privadas propuestas `/api/student-progress/training` y `/api/student-progress/competitions`, con `studentId` académico y sesión Bearer existente. Los IDs externos se resuelven en el servidor, nunca se aceptan del navegador como autoridad. Respuestas con estado por fuente, `checkedAt` de última lectura correcta, `sourceUpdatedAt` solo si existe, `linkRevision` y registros mínimos. `checkedAt` no es la fecha deportiva ni se actualiza en un cache hit.

Los nombres de rutas, contratos y namespace de este apartado son diseño propuesto, no descubrimientos. Antes de implementarlos deben acordarse sus schemas JSON y ejemplos con ambos sistemas. No se emitieron credenciales, crearon bridges ni añadieron estos endpoints durante esta tarea.

## 4. Identidad y permisos

Se propone `student_progress_links` en Supabase, **tabla nueva**, con: ID propio, `student_id`, fuente, `external_id`, estado pending/confirmed/revoked, revisión, evidencia administrativa, confirmador y fechas. Otra tabla nueva registra cambios de vínculo. No guarda puntajes ni documentos personales.

- Un alumno puede tener un ID de `aa_academy_students` confirmado y varios `competitor_id` de TE confirmados: TE no garantiza una identidad única entre todos los torneos. No se fusionan IDs de origen.
- Un mismo ID externo confirmado no puede pertenecer a dos alumnos de reservas. El servidor rechaza esa operación y exige revisión administrativa. Revocar o sustituir conserva auditoría.
- La búsqueda por nombre solo propone candidatos a un administrador; no confirma una identidad. Nombres iguales, nombres cambiados, distancia o categoría no bastan para vincular. Con evidencia insuficiente, el vínculo queda pendiente.
- **Operación administrativa cerrada:** un panel Mi progreso en la ficha existente del alumno, con una fila por fuente y acciones Vincular, Revisar y Desvincular. En la entrega 1 solo existe la fila Controles. Sin consola de sincronización, pantalla de importaciones, emparejamiento masivo ni carga manual de puntajes.
- Vincular consiste en seleccionar o introducir el ID externo, consultar una vista previa de identidad de origen y confirmar explícitamente una vez con evidencia suficiente. La PWA conserva la decisión administrativa y su auditoría. No exigir al administrador copiar el mismo vínculo en tres interfaces. El nombre ayuda a revisar, pero no decide la vinculación.
- En la entrega 2 la misma acción coordina el bridge TE del namespace propio y la confirmación local. Se confirma localmente solo después de verificar el bridge; si falla, queda Pendiente con una acción Reintentar. El backend utiliza un comando administrativo de identidad limitado y separado del lector deportivo, a definir en TE. No usar SQL/CLI como operación habitual ni exponer la credencial de ese comando al navegador. `addConfirmedBridge` no sirve tal cual porque fija `as_athlete`.
- Un reintento no crea otro vínculo ni otro bridge. Si la respuesta de TE se pierde, se consulta el estado antes de repetir. La revocación local corta el acceso inmediatamente aunque la limpieza del bridge de origen requiera reintento; el estado pendiente de esa limpieza queda visible al administrador. No añadir una cola general de trabajos para este flujo.
- Si el administrador confirma la decisión pero todavía falta verificar el bridge TE, la vinculación efectiva de competencias sigue Pendiente; controles puede estar disponible. No presentar ese estado como alumno sin competencias ni confirmar localmente el acceso antes de verificar el bridge.
- Reutilizar Supabase Auth, validar el JWT con `auth.getUser` en servidor y llamar `resolve_accessible_student_id` con el cliente del actor antes de leer enlaces o caché. No usar service role para eludir esta validación. Un tutor solo accede a sus alumnos; admin usa el acceso existente y tiene exclusividad para confirmar/revocar vínculos.
- RLS de tablas nuevas: lectura propia/tutor autorizado; escritura solo administrativa mediante operación auditada. El cliente no puede cambiar `student_id`, fuente, ID externo o confirmador para concederse acceso.
- React Query se identifica por cuenta, alumno, fuente y revisión del vínculo. Al cambiar alumno no se conserva placeholder del anterior; se cancelan solicitudes pendientes y se ignoran respuestas de otra clave. Al cerrar/cambiar cuenta se limpia la caché privada.
- Ninguna ruta pública recibirá estas proyecciones privadas. Las credenciales de integración serán distintas de AS/AP y de la cookie de liga; no usar variables `NEXT_PUBLIC_*`, query strings, logs o bundles para secretos.

## 5. Experiencia y reglas deportivas

### 5.1 Acceso y disposición

Decisión de acceso: Mi progreso desde una tarjeta en Inicio. La página usa header con volver, identidad del alumno seleccionado y cambio de alumno para tutores. Se conservan las cuatro acciones inferiores actuales; en Mi progreso ninguna se marca falsamente como sección actual. No se añade una quinta pestaña estrecha.

En móvil: resumen y contenido en una columna. La entrega 1 muestra directamente Controles; en la entrega 2 se añade el selector Controles/Competencias, con Controles como vista inicial. Filtros visibles; lista paginada de diez intentos sin cambiar el alcance completo de la gráfica. En escritorio: contenedor adaptable actual de 1120 px; resumen arriba, gráfica/filtros junto al historial cuando haya espacio. Competencias conserva su sección diferenciada. No mostrar columnas que requieran desplazamiento horizontal en móvil.

Gráfica accesible con alternativa de tabla/lista, leyendas, etiquetas y valores que no dependan del color. Un único h1; controles asociados a etiquetas; foco y selección de filtros accesibles por teclado. Todos los estados explican qué puede hacer el alumno sin mostrar errores técnicos.

### 5.2 Distancia actual y discrepancias

La única distancia de entrenamiento asignada comprobada es `students.current_distance_m`. No se tomará la distancia de liga, la máxima histórica ni una competencia como sustituto. La API de progreso relee este campo autorizado en cada revalidación; no acepta como autoridad una distancia del navegador ni conserva un resumen de una asignación anterior en caché.

**Regla de presentación cerrada:** el encabezado utiliza Distancia actual de entrenamiento solo si hay asignación y un último control global válido con distancia inequívoca que coincide con ella. En los demás casos utiliza Distancia asignada o Distancia pendiente de confirmar. Nunca oculta una discrepancia detrás de la etiqueta Actual. La distancia elegida para explorar el historial no cambia ese encabezado ni la asignación.

| Situación | Presentación propuesta |
| --- | --- |
| Distancia asignada y último control global coinciden | Mostrar Distancia actual de entrenamiento y resumen de esa distancia |
| Asignada distinta del último control global | Mostrar Distancia asignada X m y Último control registrado a Y m, con sus fechas y texto Pendiente de revisión. No afirmar que Y es una nueva asignación ni modificar X. Mostrar último control y mejores marcas **en X**, si existen; si no, Sin controles a X m |
| Asignada sin controles | Mostrar Distancia asignada X m y Sin controles registrados; no fabricar último control ni afirmar que fue corroborada por un control |
| Sin asignación, con controles | Distancia de entrenamiento pendiente de confirmar; último control global con su distancia como dato histórico. No asignar automáticamente esa distancia |
| Sin asignación ni controles | Pendiente de asignación y Sin controles; permitir consultar competencias si están vinculadas |
| Última fecha con distancias diferentes y orden deportivo incierto | Mostrar Distancia asignada X m y las distancias de los controles de esa fecha; no elegir la supuesta última distancia por created_at/ID ni declarar coincidencia validada |
| Fuente caída o respuesta incompleta | Puede mostrarse la asignación comprobada en PWA; no llamarla Actual basándose en una corroboración deportiva caducada o parcial |

La advertencia de discrepancia es informativa: después de avanzar de distancia puede ser normal no tener aún un control allí. No diagnostica un error de origen ni bloquea el historial. El administrador ve el mismo aviso en la ficha y revisa la asignación en su editor existente o corrige el control en la web, según corresponda. Mi progreso no crea un tercer lugar donde editar distancia. La fecha del último control permanece visible aunque sea antigua; Consultado hace un minuto no significa que el alumno haya entrenado hace un minuto.

### 5.3 Resumen principal

- Último control **válido en la distancia asignada**, considerando ambos formatos, con puntaje/máximo, cantidad de flechas y fecha deportiva. La tarjeta dice el formato; nunca interpreta una marca de 72 como 36.
- Mejor marca válida de 36 flechas en esa distancia: máximo 360.
- Mejor marca válida de 72 flechas en esa distancia: máximo 720.
- Las mejores marcas consideran todo el historial válido de esa distancia y formato, independientemente de la página y filtros de fecha del historial. Cada tarjeta indica su alcance para evitar confusión.
- Último 280/360 y mejor 305/360 producen tarjetas distintas aunque el control de 305 sea anterior. Un 600/720 no reemplaza la mejor de 36.
- Cero es un puntaje válido si está presente y documentado; ausencia o dato inválido nunca se convierte en cero.

Último significa fecha deportiva más reciente. En un mismo día con todas las horas conocidas, ordenar por hora. Si alguna hora es desconocida, el origen no permite probar cuál ocurrió último: usar orden estable por registro/ID para listar, marcar Hora desconocida/Orden del día no confirmado y describir la tarjeta como Último registro de esa fecha. No inventar 00:00 ni usar `updated_at` de una corrección como fecha del tiro. Para empates de mejor puntaje, mostrar la primera fecha deportiva documentada; no dar significado deportivo al desempate técnico por ID.

### 5.4 Historial y evolución de entrenamiento

- Consultar todos los intentos del alumno vinculado; filtros por distancia, formato 36/72/todos y rango inclusivo de fechas civiles Lima. La distancia inicial es la asignada; sin ella, solicitar selección entre distancias con controles. El rango inicial incluye todo el historial y queda visible como Todas las fechas.
- Formato inicial: 36 flechas; si no tiene controles válidos de 36 en la distancia seleccionada pero sí de 72, abrir 72. Si no tiene ninguno, mantener 36 con estado vacío explícito. Nunca seleccionar un formato por comparar su puntaje con el del otro.
- La lista de diez por página se calcula después de filtrar. Totales y gráfica representan todos los registros del filtro, no la página cargada. Señalar el intervalo aplicado; sin filtro de fecha, es todo el historial.
- Una gráfica contiene una distancia y un formato. Si se elige Todos los formatos, mostrar dos gráficas separadas, con escalas 0–360 y 0–720. Nunca una línea combinada, porcentaje normalizado, promedio entre formatos ni suma de intentos independientes.
- Eje temporal por fecha deportiva. Los intentos de una misma fecha permanecen consultables individualmente; coincidencias de puntos muestran su cantidad y lista accesible. No inventar horas para separarlos. Un solo intento se muestra como punto, no como tendencia.
- Un control corregido actualiza la misma entidad; una anulación se excluye de último/mejores/gráfica y permanece en el historial con distintivo Anulado, sin incluir el motivo privado. El conteo distingue intentos totales de controles válidos. No mostrar una anulación como cero ni unirla a la serie válida.
- Cambiar la distancia asignada cambia el filtro inicial del resumen, no la distancia de los controles previos ni sus mejores marcas históricas.

### 5.5 Competencias

Una tarjeta por participación individual, agrupada por evento y categoría, ordenada por fecha del evento descendente. No colapsar participaciones legítimas del mismo evento por nombre, puntaje o categoría parecida.

- Evento: `name`, `start_date/end_date`. Si no existe fecha de la clasificación, decir Fecha del evento, sin atribuir una hora de tiro.
- Categoría: `competitive_class.label`; conservar diferencias entre categorías y contexto documentado.
- Distancia: valores documentados en segmentos; si hay varios, listar las distancias sin promediarlas. En `total_only`, usar distancia directa documentada. Si falta, No documentada.
- Flechas: `arrow_count` positivo y documentado. Cero o ausencia no autorizan deducir 36/72 ni el máximo de puntaje; presentar formato no documentado cuando no pueda interpretarse. No reconstruir series o flechas desde un total.
- Puntaje de clasificación: `qualification.score` cuando existe clasificación. Nunca `matchSide.set_points`, resultado de encuentro o puesto final. No sintetizar qualification si solo hay inscripción/resultado final. Si hay varias qualifications, mostrarlas separadas con su formato, sin sumarlas.
- Posición de clasificación: `qualification.rank` si está documentado; si falta, usar una entrada única y explícita `ranking_type=qualification` para esa participación. Si ambas fuentes difieren, indicar posición por revisar en lugar de escoger silenciosamente una. No calcular posiciones ordenando puntajes.
- Posición final: `final_results.final_position`, mostrando estado oficial/provisional/DNS/DNF/descalificación según fuente. Como alternativa, una entrada explícita `ranking_type=final`, sin atribuirle oficialidad que no documente. Una posición de clasificación nunca rellena una final.
- Enlace Origen únicamente si TE entrega una URL explícita, HTTPS y de dominio permitido. Si no, omitir el enlace; conservar internamente versión y referencias para trazabilidad.

El canon permite encuentros por sets y acumulativos, byes y desempates. Su visualización detallada se deja fuera del MVP. Una ampliación solo podrá presentar cada encuentro con `scoring_mode`, estado, lados y ganador documentados; nunca mezclar puntos de set con puntajes de clasificación ni completar flechas ausentes.

## 6. Actualización, identidad de registros y fallos

Propuesta inicial: lectura bajo demanda, caché de origen de cinco minutos, actualización al abrir/reanudar y cada cinco minutos mientras la pantalla esté visible. Revalidación manual con control de frecuencia. Cada fuente tiene su propio límite, timeout y estado. No añadir Cron, cola ni sincronización persistente de puntajes.

La autorización y el vínculo se comprueban antes de toda lectura de servidor, incluidos cache hits. La caché de origen se identifica por fuente, ID externo, contrato y revisión del enlace; nunca por nombre. La respuesta al navegador es `private, no-store`. Un cambio de enlace invalida sus proyecciones.

La distancia asignada se lee separadamente bajo permisos del actor. El resumen derivado usa esa distancia de la misma respuesta, no la de un dashboard anterior. Cambiarla invalida resumen/filtro inicial al revalidar; no obliga a descartar el snapshot histórico válido. Las pruebas cubrirán el cambio con caché de controles caliente y la llegada tardía de una respuesta anterior.

- Controles: snapshot completo por ID de alumno externo. Clave por `(fuente, control.id)`; sustituir por revisión actual, no anexar en cada consulta. Conservar anulados como tales; una respuesta parcial o fallida no borra controles.
- TE: listar todas las páginas de history para cada ID confirmado, elegir exclusivamente versión publicada actual y consultar snapshots. Agrupar por `(dataset_id, participation_id)` y sus `qualification_id`; guardar versión como procedencia, no como una competencia nueva. Deduplicar repeticiones de IDs, no resultados parecidos. El nonce `snapshot_id` no es clave de identidad.
- Nueva versión: reemplazar la proyección anterior de ese dataset, incluidas correcciones, tombstones y entidades ya ausentes del snapshot completo. Un dataset retirado del catálogo completo no queda como resultado vigente. Un error/timeout de catálogo no equivale a retirada.
- Respuestas incompletas, límites de paginación o fallo de una de varias identidades TE producen Parcial/No disponible, nunca Sin competencias. Si una versión deja de estar publicada durante la lectura, renovar el catálogo una vez; no mezclar versiones.
- Mientras el snapshot válido esté en caché, mostrar su `checkedAt` real. Al caducar y fallar la fuente, no seguir presentando puntajes antiguos como vigentes: mostrar fallo de esa sección y última consulta correcta si se conoce. La otra fuente continúa disponible. No prometer disponibilidad de la sección caída sin una copia persistente.

| Estado por fuente | Texto/acción |
| --- | --- |
| Cargando | Indicador local de esa sección |
| Identidad sin confirmar o revocada | Registros pendientes de vinculación por la academia; sin solicitud al origen |
| Consulta completa sin datos | Sin controles registrados / Sin resultados de competencias publicados |
| Datos correctos | Contenido y Consultado el… con fecha/hora de Lima |
| Datos parciales | Mostrar solo resultados verificados, indicar cobertura incompleta y reintentar; no calcular resumen como si fuera completo |
| Error/timeout/configuración pendiente | No pudimos consultar esta fuente; reintentar y soporte. Sin detalles de infraestructura ni falsos ceros |
| Sin autorización | No entregar datos; recuperar contexto o acceso. Sin consulta al origen |

“Actualizado” significa última consulta correcta a esa fuente; `updated_at` de un control significa modificación de origen y la fecha deportiva significa cuándo se realizó. No intercambiar estos conceptos.

## 7. Dependencias y bloqueos precisos

No falta acceso técnico de lectura a las bases para este diseño: ambas se inspeccionaron. Lo que falta para habilitar el producto es:

1. Endpoint privado de controles y política expresa para historial privado del alumno aunque no sea público. La API pública no satisface todo el alcance.
2. Para la **entrega 2**, consumidor/credencial/namespace propios de reservas en TE y contrato mínimo acordado. No puede resolverse copiando un token AS/AP ni llamando a un endpoint supuesto. No es dependencia de la entrega 1.
3. Confirmaciones administrativas reales: vínculo PWA–web para la entrega 1; añadir vínculos/bridges TE en la entrega 2. No se vincularon personas durante la inspección.
4. Para la entrega 2, comando de identidad TE seguro e idempotente que permita una única confirmación administrativa desde PWA y gestione reintentos/revocación. Debe estar operativo antes de indicar la vinculación de competencias como completa; no bloquea controles.
5. Procedencia URL: no hay campo reutilizable comprobado. No bloquea mostrar resultados; sí bloquea ofrecer un enlace Origen hasta que exista evidencia en TE.

Las discrepancias entre distancia asignada y último control no bloquean consultar el historial. Deben quedar visibles y resolverse en la administración que ya asigna distancias, sin mutaciones de Mi progreso.

## 8. Criterios de aceptación

1. Alumno autorizado ve solo sus registros, y tutor solo los del alumno seleccionado. Cambiar alumno no muestra datos previos ni acepta respuestas tardías del anterior.
2. Último 280/360 y mejor 305/360, ambos a 30 m, aparecen distintos. La mejor de 72 permanece separada.
3. Al pasar de 20 a 30 m se conservan todos los intentos de 20 y sus filtros. Una discrepancia de asignación/control se explica sin cambiar ninguna fuente.
4. Toda gráfica distingue distancia y 36/72; la lista, sus totales y la gráfica se calculan sobre el conjunto filtrado completo.
5. Corrección conserva ID; anulación retira la marca del resumen/gráfica. Consultas repetidas o dos IDs TE con una misma participación no duplican entidades canónicas.
6. Competencias muestra categoría/distancia/formato/puntaje/posiciones solo cuando están documentados, con estados y ausencias explícitos. No utiliza una posición final como clasificación ni inventa un enlace.
7. Sin controles, sin competencias publicadas, sin enlace y fuente caída son estados diferentes. Una fuente puede fallar conservando disponible la otra.
8. Dos personas del mismo nombre no se vinculan automáticamente; confirmar un ID ya asignado a otro alumno se rechaza de forma transaccional.
9. JWT inválido o alumno ajeno produce 401/403 antes de consultar orígenes o reutilizar una caché. RLS impide confirmar vínculos desde el cliente de alumno/tutor.
10. Correcciones y nuevas publicaciones aparecen tras revalidación, con plazo objetivo de cinco minutos en una pantalla activa y fuentes disponibles. La fecha visible corresponde a una consulta real correcta.
11. Funciona a 320/390 px y escritorio de 1440 px, con navegación por teclado y alternativa legible a la gráfica. No altera reservas, membresías, liga ni rankings.

### Puertas de aceptación por entrega

**Controles:** cumplir íntegramente los criterios de identidad, permisos, tutor, caché y reglas de entrenamiento sin configurar TE ni crear sus bridges. Probar también nombres iguales, confirmación concurrente, acceso a caché tras revocar, distancia cambiada con caché caliente y último día de orden incierto. La ausencia de TE no genera errores ni solicitudes de red. Esta entrega es una sección utilizable, no un esqueleto de ambas fuentes.

**Competencias:** conservar todas las pruebas anteriores y añadir todos los casos TE y de fallos independientes. Probar además bridge ajeno, confirmación remota fallida, respuesta perdida, reintento idempotente y revocación local con limpieza remota pendiente. No reducir estas pruebas para simplificar la operación del administrador.

## 9. Qué se hizo en esta tarea

Inspección de código, metadatos SQL, consultas SELECT y GET de APIs existentes. Se redactaron esta spec y el plan asociado. No se implementaron rutas/componentes, aplicaron migraciones, crearon vínculos/credenciales, modificaron puntajes o datos de negocio ni desplegaron cambios.
