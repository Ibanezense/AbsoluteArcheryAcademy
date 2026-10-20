# Mi progreso — Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: usar `executing-plans` para ejecutar este plan por tareas y entregas. Este documento no inicia ni autoriza por sí solo cambios sobre bases reales o despliegues.

**Goal:** entregar primero Controles completo y después Competencias, manteniendo la identidad confirmada, los permisos y la separación de fuentes.

**Architecture:** APIs privadas de servidor por alumno/fuente y caché de cinco minutos. Supabase conserva vínculos y auditoría; los puntajes permanecen en sus fuentes. La primera entrega funciona sin TE. La segunda incorpora TE mediante el mismo panel administrativo y una confirmación coordinada, sin operaciones manuales repetidas en tres sistemas.

**Tech Stack:** PWA Next.js 14/React 18, Supabase Auth/PostgreSQL, React Query, Tailwind, Recharts y Vitest existentes; web Next.js/Turso; Tournament Engine Node.js/libSQL y contratos JSON. Sin actualización general de dependencias.

---

Fecha del ajuste: 19 octubre 2026, America/Lima. Spec: [Mi progreso](../specs/2026-10-19-mi-progreso.md). Estado: entregas 1A–1E implementadas y revisadas localmente. Entrega 1F verificada con datos sintéticos, pendiente de activación autorizada y piloto real. Entrega 2 pendiente de esa puerta de aceptación. Evidencia: [verificación de Controles](../qa/2026-10-19-student-progress-controls.md).

## 1. Fuentes y límites de ejecución

| Sistema | Raíz inspeccionada | Propiedad |
| --- | --- | --- |
| Reservas, workspace activo | `C:/Users/OMEN/.codex/worktrees/admin-ux-audit/archery-reservas-pwa` | Autenticación, alumno/tutor, distancia asignada, vínculos y UI |
| Web de academia | `D:/WEB ABSOLUTE ARCHERY` | `aa_academy_students` y todos los `aa_academy_controls` |
| Tournament Engine | `D:/Tournament Engine` | Competidores, participaciones, clasificaciones, resultados y versiones publicadas |

La PWA se inspeccionó en `cea6da3`. TE tiene cambios locales previos; no sobrescribirlos ni suponer que todo el árbol está desplegado. La web se inspeccionó como proyecto existente; no asumir una base Git limpia para publicarla. El checkout original de reservas permanece intacto.

**Hechos:** los modelos, campos, APIs existentes y observaciones reales están documentados en la sección 2 de la spec. **Propuestas:** todas las rutas, tipos, tablas, variables y archivos nuevos enumerados abajo todavía no existen. No ejecutar ahora scripts de migración/importación, escrituras de identidad, creación de credenciales o despliegues.

## 2. Entregas y decisiones cerradas

| Entrega | Incluye | Puerta de salida |
| --- | --- | --- |
| **1 — Controles** | Vínculo PWA–web, permisos completos, lector privado, resumen, gráfica, historial y filtros, estados, revisión de distancia y piloto | Sección completa verificada sin configurar TE, sin crear sus bridges y sin solicitudes a sus rutas |
| **2 — Competencias** | Consumidor/bridge propio TE, vinculación desde el panel existente, proyección de competencias y fallos independientes | Todas las pruebas de la entrega 1 siguen pasando; añadir las de TE y coordinación de identidad |

Orden obligatorio: 1A contratos de controles → 1B identidad/permisos → 1C lector web → 1D API/resumen → 1E UI → 1F aceptación/piloto. Solo después iniciar 2A consumidor/identidad TE → 2B API/competencias → 2C aceptación/publicación independiente. No dejar Controles sin su UI o verificación mientras se desarrolla TE.

Decisiones de producto que no requieren otra ronda de diseño:

- Entrada Mi progreso desde Inicio, sin quinta pestaña inferior. Entrega 1 abre Controles directamente; entrega 2 añade Controles/Competencias, inicialmente Controles. Sin pestaña deshabilitada antes de conectar TE.
- Resumen con último válido en distancia asignada y mejores marcas separadas 36/72, sobre todo el historial de esa distancia. Filtros no cambian ese resumen ni la asignación.
- Todas las fechas como rango inicial; formato inicial 36, pasando a 72 solo cuando no haya válidos de 36 y sí de 72 en esa distancia. Historial de diez por página después de filtrar; incluye anulados rotulados, excluidos de métricas/gráfica.
- Gráfica de una distancia/formato; Todos los formatos produce dos gráficas, sin normalización. Mismos días sin hora inequívoca conservan incertidumbre, no una cronología inventada.
- Distancia actual solo cuando asignación y último control global inequívoco coincidan. En discrepancia, ausencia o incertidumbre: Distancia asignada/Pendiente de confirmar, evidencia fechada y aviso de revisión. Una fuente caída tampoco corrobora una distancia como actual.
- Releer la asignación bajo permisos en cada revalidación y recalcular el resumen aunque el snapshot de controles siga en caché. La revisión se resuelve en el editor existente de distancia o en la web según el error; no crear otra copia editable.
- Un panel en la ficha del alumno, una fila por fuente, acciones Vincular/Revisar/Desvincular y una confirmación humana por vínculo. Sin consola de importaciones, carga de puntajes, emparejamiento masivo o CLI como flujo habitual.
- Mantener **todas** las pruebas de identidad/permisos, incluidas concurrencia, cachés, revocaciones y cambios de tutor. Simplificar la operación no reduce estos controles.

Dependencias: el lector privado de controles y su política de privacidad sí bloquean la entrega 1. Consumidor/namespace/bridge TE y su comando seguro de identidad solo bloquean la entrega 2. La falta de URL documentada en TE oculta Origen, sin bloquear los demás resultados.

## 3. Entrega 1A — Contratos de controles

**Archivos de referencia:**

- Web: `D:/WEB ABSOLUTE ARCHERY/db/academy.sql`, `lib/academy/model.ts`, `lib/academy/store.ts`, `docs/RANKINGS-ACADEMIA.md`.
- TE: `D:/Tournament Engine/src/infrastructure/http/consumer-api.mjs`, `src/infrastructure/queries/libsql-read-model.mjs`, `contracts/tournament-engine-canonical-v1.schema.json`, `contracts/competition-mirror-snapshot-v2.schema.json`, `db/migrations/0001_foundation.sql`.
- PWA: `lib/hooks/useStudentContext.ts`, `lib/hooks/useStudentDashboard.ts`, `app/api/admin/create-student/route.ts`, helpers de acceso de Supabase.

**Entregable de esta entrega:** schema `academy-student-controls-v1`, ejemplos mínimos/de ausencia/error y política de lectura privada. Acordarlo con la web. El schema de competencias se cierra en 2A; no es un requisito previo para empezar controles. Los hechos ya verificados en la spec no se vuelven a tratar como preguntas abiertas.

Pasos:

1. Fijar en los schemas los campos reales de la spec y la procedencia de cada campo. Separar propiedades de transporte nuevas de propiedades deportivas originales.
2. Definir snapshot completo por alumno para controles, incluidos `annulled`, `revision`, fecha deportiva y hora nullable. Definir `complete`, instante de consulta y la conducta si se excede un límite: paginar con cursor estable o fallar explícitamente; nunca truncar silenciosamente.
3. Definir respuestas de vínculo pendiente, alumno sin controles y fuente no disponible, revisión de vínculo y `checkedAt`. No introducir una dependencia de TE en estos estados.
4. Confirmar que la privacidad pública `visible=0` no impedirá al alumno vinculado acceder privadamente a su historial. Hasta entonces tratarlo como decisión pendiente, no como autorización ya existente.
5. Definir la vista previa de identidad de la web para el administrador y la confirmación única en la ficha PWA. El nombre no es una confirmación automática; con evidencia insuficiente se conserva Pendiente.
6. Incorporar las reglas cerradas de distancia y presentación de la sección 2; no posponer su elección hasta implementar UI.
7. Dejar las extensiones de competencias para la entrega 2, conservando su alcance completo en la spec.

**Salida comprobable:** ejemplos válidos para 36, 72, hora desconocida, anulaciones, asignación discrepante, sujeto sin datos y fuente fallida; cada campo apunta a un campo real o se marca derivado/de transporte. Ninguna identidad real se modifica para validar estos ejemplos.

## 4. Entrega 1B — Vínculo de controles, auditoría y permisos

**Crear en la raíz PWA, nombres propuestos:**

- `supabase/migrations/<generado>_student_progress_links.sql`, generado después con `supabase migration new student_progress_links`; no inventar hoy una versión aplicada.
- `lib/server/studentProgress/auth.ts`, `lib/server/studentProgress/links.ts`.
- `app/api/admin/student-progress-links/route.ts`.
- `components/admin/StudentProgressLinks.tsx` y pruebas asociadas.
- `tests/supabase/studentProgressLinks.bootstrap.sql`, `studentProgressLinks.integration.sql`; runner SQL aislado.

**Modificar después de localizar el punto vigente:** `app/admin/alumnos/[id]/page.tsx` para integrar el panel administrativo. No alterar el editor de membresías ni los datos deportivos del alumno.

Modelo propuesto, sujeto a revisión de migración:

| Tabla nueva | Contenido y garantías |
| --- | --- |
| `student_progress_links` | `id`, `student_id`, `source`, `external_id`, `status`, `revision`, `evidence_reference`, `confirmed_by`, `confirmed_at`, `created_at`, `updated_at`; FK al alumno/cuenta confirmadora |
| `student_progress_link_audit` | ID de vínculo, actor, acción, revisión, estado anterior/posterior y fecha. Evidencia mínima; sin tokens, nombres de candidatos masivos ni documentos personales |

Restricciones: fuente en `academy_controls/tournament_engine`; estados pending/confirmed/revoked; identificador no vacío; revisión positiva. Índice único parcial para ID externo confirmado por fuente. Para controles, solo un vínculo confirmado por alumno; TE admite varios IDs confirmados del mismo alumno. No basta con validación en pantalla: garantizar unicidad/concurrencia en base.

Pasos de ejecución:

1. Escribir primero pruebas de acceso alumno/tutor/admin, confirmación no autorizada, nombres iguales, ID externo ya asignado y dos confirmaciones concurrentes.
2. Ejecutar el runner aislado y comprobar fallo antes de implementar la migración. Usar helpers reales o equivalentes fieles de acceso; nunca conectar fixtures de prueba a la base real.
3. Implementar migración aditiva, RLS y operación administrativa atómica: comprobar admin, revisar `revision`, cambiar vínculo y añadir auditoría en la misma transacción. Revisiones obsoletas devuelven conflicto.
4. Implementar validación servidor: Bearer → `auth.getUser` → `resolve_accessible_student_id` con el cliente del actor. La selección del navegador solo aporta el `student_id` académico.
5. Añadir el panel Mi progreso a la ficha con una sola fila Controles: seleccionar/introducir ID → vista previa del origen → confirmar explícitamente. Guardar la decisión en PWA y mostrar resultado. Revisar/Desvincular quedan en ese mismo panel; no exigir pasos en otra consola. No autovincular por nombre, distancia o categoría.
6. Definir revocación y sustitución con invalidación de caché. No eliminar evidencia histórica ni reasignar un ID confirmado de otra persona silenciosamente.
7. Probar también revocación con caché caliente, reemplazo de vínculo con respuesta antigua en vuelo y JWT válido de un tutor no relacionado. Ejecutar revisión de seguridad. Commit independiente de esquema/identidad, sin aplicar a la base real hasta autorización de esa acción.

**Resultado esperado:** acceso propio y de tutor autorizado; 401 sin sesión, 403 para alumno ajeno; alumno/tutor no pueden confirmar vínculos; conflicto de ID rechazado; auditoría consistente aun con fallos y concurrencia.

El modelo puede reservar el enum de fuente TE para la entrega 2, pero esta entrega no muestra su fila ni exige bridge, token o prueba de conexión de TE. No crear infraestructura de provisión remota todavía.


## 5. Entrega 1C — Lector privado de controles en la web

**Archivos propuestos en `D:/WEB ABSOLUTE ARCHERY`:**

- Crear `app/api/integrations/student-controls/route.ts`.
- Crear `lib/academy/progress-reader.ts`, `lib/academy/progress-auth.ts` y contrato/pruebas específicos.
- Ampliar `tests/academy.test.mjs` o añadir `tests/academy-progress.test.mjs` y comando de prueba en `package.json`.
- Documentar la variable de credencial exclusiva propuesta `ACADEMY_PROGRESS_READ_TOKEN` sin valor en `.env.example`.

Pasos:

1. Escribir pruebas de snapshot por ID: todos los intentos, alumno sin controles, alumno privado, corrección con mismo ID/revisión y control anulado. Añadir 401/403, IDs inválidos y aislamiento entre dos alumnos con el mismo nombre.
2. Verificar que fallan por ausencia del lector. Las bases de prueba serán locales/temporales, sin utilizar la conexión de producción.
3. Implementar autenticación de servicio y una consulta parametrizada de columnas permitidas por `student_id`. Reutilizar las tablas verificadas; no tocar `aa_league_*`, los mutadores ni `readPublicAcademy`.
4. Entregar snapshot contractual completo, con `performed_time=null` cuando corresponda. Las correcciones no crean otro intento; los anulados mantienen estado y se omite su motivo administrativo.
5. Rechazar métodos de escritura; no añadir cookies de liga al intercambio ni un endpoint de todos los alumnos para el consumidor de progreso.
6. Pasar pruebas y ejecutar regresión `npm run test:academy`, `npm run test:league`, `npm run lint`, `npm run typecheck`, `npm run build`.
7. Revisar diff de la web antes de preparar publicación separada. No incluir cambios ajenos del proyecto.

**Resultado esperado:** cada snapshot contiene únicamente el alumno pedido; el alumno privado no desaparece de su lectura privada autorizada; el ranking público y la liga conservan su respuesta y cálculos.

## 6. Entrega 1D — API privada, distancia y cálculos de controles

**Crear en PWA, nombres propuestos:** `app/api/student-progress/training/route.ts`, `lib/server/studentProgress/academyClient.ts`, `cache.ts`, `lib/utils/studentTrainingProgress.ts`, `lib/contracts/studentProgress.ts` y sus pruebas. Variables futuras de servidor: `ACADEMY_CONTROLS_URL` y `ACADEMY_CONTROLS_READ_TOKEN`. No crear ahora la ruta, cliente ni configuración de competencias.

Pasos:

1. Escribir pruebas para último 280/360 posterior a mejor 305/360; mejor de 72 aparte; cambio de distancia e historial conservado; hora desconocida y último día con distancias distintas; corrección/anulación y cero documentado.
2. Escribir pruebas de permisos antes de caché/origen, incluido vínculo revocado y caché caliente. Un 401/403 no consulta el lector ni entrega registros ya cacheados. Probar nombres coincidentes e IDs reasignados sin confundir sujetos.
3. Ejecutar esas pruebas y comprobar fallos previstos antes de implementar. Los fixtures son aislados, no registros de producción.
4. Implementar Bearer → verificación de usuario → acceso al alumno → vínculo confirmado → consulta de origen. Validar URL/protocolo de configuración, rechazar redirecciones con credenciales, timeout propuesto de 8 segundos y snapshot incompleto. Error nunca se convierte en array vacío.
5. Leer `students.current_distance_m` con el cliente del actor y de forma no mutante en cada revalidación. No aceptar distancia enviada por el navegador. Derivar resumen con esa asignación y los controles de la misma respuesta.
6. Implementar caché de snapshot por fuente/ID/contrato/revisión del enlace, de cinco minutos. No cachear una distancia antigua junto al snapshot ni un resumen sin clave de asignación. Recalcular si cambia la asignación aunque haya cache hit de controles. `checkedAt` de la fuente no se renueva artificialmente.
7. Aplicar todas las reglas cerradas de último, mejor, formatos, incertidumbre y discrepancia. Anulados permanecen rotulados en historial, excluidos de métricas/gráfica. Fecha de modificación no cambia la deportiva.
8. Responder estados pending_link/empty/ready/unavailable/forbidden y metadatos; `private, no-store` al navegador. No crear tablas de puntajes, Cron o cola.
9. Pasar pruebas y revisión. Verificar expresamente que no hay petición ni configuración obligatoria de TE.

**Salida:** API de Controles completa con asignación vigente comprobada, cobertura del conjunto completo e identidad independiente de puntajes/nombres. Cambiar distancia con caché caliente actualiza el resumen al revalidar y conserva el historial anterior.

## 7. Entrega 1E — Sección Controles completa

**Crear en PWA:** `app/mi-progreso/page.tsx`; `components/student/progress/ProgressSummary.tsx`, `TrainingHistory.tsx`, `TrainingEvolutionChart.tsx`, `ProgressSourceState.tsx`; `lib/hooks/useStudentProgress.ts`, `lib/services/studentProgressService.ts` y pruebas. Nombres propuestos, todavía inexistentes.

**Modificar:** `app/page.tsx` para la entrada y `lib/utils/studentNavigation.ts` con su prueba para no marcar Inicio falsamente. Reutilizar header, shell adaptable, StudentCard, AuthGuard, soporte y React Query existentes. No crear aún CompetitionHistory ni pestañas de competencias.

1. Escribir pruebas del cambio de tutor A/B, cierre/cambio de cuenta, respuesta tardía, vínculo revocado y discrepancia de distancia. Mantener las pruebas API/RLS; estas pruebas UI las complementan.
2. Preparar fixtures de estados de Controles y verificar sus fallos antes de implementar. Simular TE no configurado para demostrar independencia.
3. Implementar acceso y resumen de tres tarjetas, con distancia/fuente/fechas rotuladas según la spec. La exploración de otra distancia no cambia el encabezado de asignación.
4. Implementar filtros de distancia, 36/72/todos y fechas, lista paginada de diez y conteos del filtro completo. Mostrar anulados rotulados. Resumen vitalicio de la distancia asignada separado de filtros.
5. Usar Recharts existente y alternativa tabular. Gráficas separadas para formatos, puntos coincidentes accesibles, sin cronología o normalización inventada.
6. Mostrar Consultado el… de la fuente y fecha deportiva del último control por separado. Revalidar al abrir/reanudar y cada cinco minutos con pantalla visible. La asignación también se refresca, incluso cuando los controles proceden de caché.
7. En la ficha administrativa mostrar la misma discrepancia y acceso al editor de distancia existente, sin un editor duplicado ni una nueva bandeja de revisiones. Mantener el aviso hasta que los datos realmente concuerden o se explique la ausencia de controles.
8. Verificar accesibilidad, teclado, foco, un h1 y tamaños 320/390/1440 px. Revisar reservas, membresías, liga y rankings sin cambios de comportamiento.
9. Pasar pruebas y revisar UI; commit específico. No presentar un fallo de competencias donde esa fuente todavía no está habilitada.

## 8. Entrega 1F — Aceptación, piloto y punto de control

- Ejecutar toda la cobertura de Controles e identidad/permisos, incluidos concurrencia, revocación, caché y tutor. La matriz de la sección 11 conserva también los casos de TE para la siguiente entrega; no se eliminan ni se declaran aprobados antes de implementarlos.
- PWA: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` y SQL aislado de vínculos/RLS. Web: `npm run test:academy`, `npm run test:league`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Probar navegador → API PWA → autorización → web → resumen/gráfica/historial en staging y con vínculos sintéticos. Después de autorización, piloto real de solo lectura con identidades confirmadas.
- El piloto tiene que demostrar una vinculación operable desde una ficha, último distinto de mejor, discrepancia de distancia, cambio con caché caliente y respuesta tardía, corrección/anulación, historial completo y ausencia de TE sin errores.
- Registrar evidencia en un futuro `docs/qa/mi-progreso-controls-acceptance.md`. No confirmar identidades ni modificar puntajes de producción para fabricar casos de prueba.
- Esta entrega puede publicarse tras autorización con `STUDENT_PROGRESS_ENABLED`; no necesita publicar TE ni preparar sus secretos. Ver la sección 12.

**Puerta para iniciar entrega 2:** Controles completo aceptado, sin bloqueantes de identidad/permisos, mantenimiento administrativo comprensible y reglas de distancia verificadas. No reducir cobertura para pasar esta puerta. La funcionalidad total sigue pendiente de Competencias.

## 9. Entrega 2A — Consumidor TE y vínculo administrado desde PWA

**Archivos en `D:/Tournament Engine`:**

- Modificar `src/infrastructure/http/consumer-api.mjs` y, solo si es necesario, `api/v1/consumer.mjs`.
- Crear `src/infrastructure/queries/academy-progress-read-model.mjs` y `contracts/academy-individual-progress-v1.schema.json`.
- Ampliar validación de contratos en `src/contracts/index.mjs` y pruebas de contrato/integración.
- Crear un comando administrativo de identidad TE, separado del lector y con autenticación/privilegios propios, para consultar/confirmar/revocar el bridge. Su ruta y contrato son nuevos y deben acordarse con TE. La CLI puede existir como herramienta excepcional del propietario, no como flujo habitual para el administrador de la academia.
- Documentar la credencial propia propuesta `TE_ACADEMY_API_TOKEN`. No cambiar ni copiar las de AS/AP.

Pasos:

1. Cerrar `te-academy-individual-progress-v1`, history/dataset, categorías individuales, posiciones y bajas, además del comando de identidad y su alcance. Escribir pruebas de consumidor academy: Bearer propio, tokens de otros consumidores rechazados, bridge confirmado del namespace correcto, IDs ajenos/AS denegados y métodos distintos de GET denegados en el lector.
2. Añadir fixtures de versiones publicadas/sustituidas/retiradas, dos páginas de history, clasificación con rank nullable y ranking explícito, total_only, varias distancias, cero flechas no interpretable, participación sin clasificación y final oficial/provisional.
3. Ejecutar pruebas y confirmar fallo antes de implementar el consumidor. No correr scripts llamados import/publish/migrate sobre la base real para probarlo.
4. Implementar history y dataset con consultas de solo lectura y guard de bridge propio. Filtrar `event_type=individual`; conservar IDs/versiones/estados originales. El resto de consumidores debe mantener su contrato y comportamiento.
5. Implementar proyección mínima contractual. Reutilizar entidades canónicas; no reconstruir Ianseo, sumar sets como clasificación, cambiar puntuaciones ni completar datos ausentes.
6. Ampliar el panel PWA con la fila Competencias. Una confirmación humana verifica la identidad y el servidor coordina el bridge TE y luego confirma/audita el vínculo local. No son una transacción entre bases: si TE confirma y falla el commit local o se pierde la respuesta, mantener Pendiente y verificar estado antes de un reintento idempotente. No crear otro bridge ni volver a pedir la misma decisión humana. La función `addConfirmedBridge` no sirve tal cual porque fija `as_athlete`.
7. Añadir pruebas de confirmación remota fallida, respuesta perdida, conflicto de identidad, confirmaciones concurrentes y revocación local inmediata aunque la limpieza remota quede pendiente. El lector exige vínculo local confirmado además del guard de TE; un bridge huérfano no concede acceso desde PWA. Ejecutar `npm run test:contracts`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, `npm run security:secrets`, con entorno aislado. Revisar que ninguna prueba esté configurada para escribir en producción.
8. Preparar publicación aditiva de API/contrato. No reprocesar torneos ni modificar versiones, RAW o resultados para habilitar el consumidor.

**Resultado esperado:** academy solo lee sujetos con su bridge; AS/AP siguen pasando su regresión. El consumidor nuevo no devuelve competidores nacionales completos ni datos personales innecesarios.

La operación administrativa no vuelve a introducir datos deportivos ni transfiere su autoridad a PWA. La PWA conserva la decisión humana; TE aplica el bridge de autorización. Revisar/Desvincular/Reintentar se realizan desde la misma ficha con auditoría. No añadir una plataforma general de trabajos.


## 10. Entrega 2B/2C — Competencias, regresión y aceptación conjunta

**Crear en PWA:** `app/api/student-progress/competitions/route.ts`, `lib/server/studentProgress/engineClient.ts`, `lib/utils/studentCompetitionProgress.ts`, `components/student/progress/CompetitionHistory.tsx` y pruebas. Ampliar contratos, hook y página existentes; no crear otra gestión de alumnos o vínculos.

Variables futuras exclusivas de servidor: `TOURNAMENT_ENGINE_URL`, `TOURNAMENT_ENGINE_ACADEMY_TOKEN` y la credencial del comando de identidad, con privilegios separados. No reutilizar tokens AS/AP ni exponerlas al navegador.

1. Escribir y ejecutar primero los casos de competencias de la matriz: versiones, paginación, total_only, posiciones, formatos ausentes y origen no documentado. Mantener todas las pruebas de entrega 1 en el mismo CI.
2. Reutilizar el guard JWT/alumno/enlace antes de origen/caché. Recorrer history de todos los IDs TE confirmados; deduplicar por IDs canónicos y sustituir la proyección completa al cambiar versión. Detectar cursores repetidos, respuesta incompleta, retirada y errores sin falsos vacíos.
3. Mantener puntaje de clasificación y posiciones diferenciadas, estado oficial/provisional documentado y ausencias explícitas. Sin flechas inventadas, extracción de Ianseo ni detalle de eliminatorias.
4. Añadir selector Controles/Competencias a la página. Controles conserva acceso, UI, filtros y resumen cuando falle TE. Error de web tampoco bloquea competencias. Fuente caída no determina la distancia de entrenamiento.
5. Verificar permisos del nuevo consumidor, nuevos bridges y reintentos de identidad sin reducir las comprobaciones locales. Probar fallo remoto antes/después del ACK y revocación local con caché caliente.
6. PWA: suite/lint/TypeScript/build/SQL. TE: `npm run test:contracts`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, `npm run security:secrets`, con entorno aislado; comprobar AS/AP. Repetir regresión web/league si el diff de integración la afecta.
7. Probar preview/staging y piloto autorizado, con ambas fuentes, tutor que cambia de alumno y fallos independientes. Contrastar IDs/revisiones/versiones con las fuentes; no publicar datos identificables ni crear resultados de negocio para las pruebas.
8. Registrar evidencia en un futuro `docs/qa/mi-progreso-competitions-acceptance.md`. Habilitar la entrega 2 con un interruptor independiente propuesto `STUDENT_PROGRESS_COMPETITIONS_ENABLED`, inicialmente desactivado; la entrega 1 debe seguir disponible.

**Salida:** funcionalidad completa de la spec, ambas fuentes independientes y una operación administrativa desde la ficha existente. La ausencia de URL de origen oculta el enlace; no provoca deducciones ni bloquea resultados disponibles.

## 11. Matriz de pruebas — conservar cobertura completa

Fixtures de ejemplo son sintéticos. Ninguno autoriza crear datos en las bases reales. Entrega 1 ejecuta todos los casos de controles, identidad y permisos; entrega 2 mantiene esos casos y añade todos los de TE/fallos conjuntos. No sustituir pruebas de RLS/API por inspecciones visuales o de texto.

| Caso | Verificación obligatoria |
| --- | --- |
| Último frente a mejor | 305/360 anterior y 280/360 posterior a 30 m: último 280, mejor 305 |
| Cambio/discrepancia de distancia | Asignada 30, historial 20; 20 permanece filtrable, no se mueve ni se actualiza asignación. Último global distinto se informa |
| Formatos | 305/360 y 600/720: dos mejores, dos series/ejes independientes; no aparece 600 en una escala de 360 |
| Fecha/hora desconocida | Fecha civil conserva día Lima; hora null no se transforma en medianoche; orden del mismo día incierto queda indicado |
| Corrección | Mismo control, revisión 1→2, cambia puntaje y fecha si lo corrigió la fuente; una sola fila de identidad; recalcular último y mejor |
| Anulación | Mejor marca pasa a annulled: desaparece de métrica/gráfica y permanece rotulado como anulado en historial; nunca cero ficticio |
| Relectura/duplicados | Mismo snapshot leído repetidamente, `snapshot_id` nuevo y misma versión TE: ninguna duplicación. Dos links que entregan el mismo participation_id se unen por ID |
| Nueva versión/baja TE | Dataset publicado sustituido retira la proyección anterior, aplica tombstones; catálogo fallido/parcial no produce bajas ni falso vacío |
| Posiciones | Qualification rank null con ranking_type=qualification: usar posición explícita. Final distinto: no confundir. Valores contradictorios: posición por revisar |
| Formato incompleto | total_only con distancia directa, segmentos a varias distancias, arrow_count=0 y formato ausente: sin inferir 36/72, diana o máximo |
| Participación incompleta | Inscripción/DNS/DNF o final sin qualification: no fabricar clasificación ni asumir puntaje cero |
| Fuentes separadas | Resultados de competencia no cambian mejores marcas de entrenamiento ni llaman mutadores de liga/rankings |
| Ausencias | Sin controles, sin competencias publicadas y sin vínculo: textos distintos; la otra sección sigue funcionando |
| Identidad | Dos nombres idénticos con IDs distintos no se enlazan solos; ID ya asignado a otro alumno produce conflicto |
| Tutor | Alternar alumno A/B, filtros y respuestas tardías; no hay parpadeo de datos de A en B |
| Acceso ajeno | Cambiar studentId en URL o llamar API directamente: 403 y cero consultas a fuentes/cachés de otro alumno; JWT inválido: 401 |
| Tokens y namespaces | Token AS/AP no permite consumidor academy; bridge AS no sirve como bridge de reservas; credenciales no aparecen en bundle/URL/log |
| Fallo independiente | TE 503/timeout o cuerpo inválido: controles siguen listables; web caída: competencias siguen. Una identidad TE fallida declara Parcial |
| URL ausente/no permitida | No se inventa enlace; se rechazan javascript, http no autorizado y destinos ajenos/redirecciones con token |
| Accesibilidad | Tabla alternativa, datos coincidentes accesibles, filtros etiquetados, teclado, h1 único y lectura móvil/escritorio |
| Regresión | Mismas reglas y operación de reservas, membresías, liga y rankings con funcionalidad deshabilitada y habilitada |
| Distancia con caché caliente | Cambia la asignación y se reutiliza un snapshot de controles vigente: resumen recalculado con la asignación de la respuesta actual, no la cacheada |
| Última fecha ambigua | Controles en distancias distintas con alguna hora desconocida: no escoger una distancia como última usando ID/registro ni rotular coincidencia como corroborada |
| Corroboración antigua/caída | La fecha deportiva antigua sigue visible; consulta reciente no implica entrenamiento reciente. Fuente parcial/caída no valida la distancia como actual |
| Vínculo revocado y caché caliente | 403/estado pendiente según operación, sin reutilizar puntajes de una identidad que ya no está confirmada |
| Confirmación concurrente | Mismo ID externo reclamado por dos alumnos: solo uno confirmado, conflicto y auditoría íntegra |
| Entrega 1 sin TE | Sin variables, bridge ni servicio TE: controles completo funciona y no se llama a esa fuente |
| Confirmación TE fallida/ACK perdido | Estado local pendiente, consulta de estado antes de reintentar y una sola vinculación; sin datos mientras falta confirmación |
| Revocación TE incompleta | Revocación local bloquea inmediatamente lectura/caché; limpieza remota pendiente visible solo al admin, reintento seguro |


## 12. Publicación y reversión por entrega

Solo en una futura ejecución autorizada. Preparar revisión, pruebas, respaldo de metadatos necesario y registro de versiones. No incluir cambios ajenos de los repositorios de origen.

**Entrega 1:** publicar el lector privado de la web; aplicar la migración aditiva de vínculos/RLS tras autorización de base real; configurar únicamente secretos de controles; confirmar identidades piloto desde la ficha; publicar PWA con `STUDENT_PROGRESS_ENABLED` desactivado y habilitar tras verificar permisos, identidad y distancia. No crear ni exigir TE en esta publicación.

**Entrega 2:** mantener controles habilitado; publicar consumidor/comando de identidad TE aditivos con credenciales propias; desplegar API/UI de competencias con `STUDENT_PROGRESS_COMPETITIONS_ENABLED` desactivado; confirmar vínculos piloto mediante el panel existente y habilitar tras aceptación conjunta. Mantener contratos AS/AP sin cambios.

En ambos casos, una autorización para programar no reemplaza las autorizaciones reservadas para cambios de base real o publicación. Los secretos se configuran fuera de Git, sin variables públicas ni copia indiscriminada a preview. Monitorizar errores/latencia y estados de vínculo por fuente, sin nombres, payloads deportivos completos o secretos en logs.

**Reversión entrega 2:** apagar solo competencias y restaurar su API/UI si es necesario; controles continúa disponible. Revocar únicamente credenciales nuevas comprometidas e invalidar cachés afectadas. No desmontar vínculos de controles ni cambiar la asignación de distancia.

**Reversión entrega 1:** apagar la entrada y rutas de Mi progreso, restaurar PWA anterior si procede y retirar solo su credencial de controles si existe problema de acceso. Conservar tablas de identidad/auditoría inertes y resultados de origen. Ningún rollback borra controles, versiones TE, liga o rankings. Resolver limpieza pendiente de bridges sin reabrir accesos locales revocados.

**Completado de Controles:** entrega 1 aceptada con identidad/permisos íntegros, UI completa, manejo de distancia y revisión visual; lista para publicación autorizada aunque competencias siga pendiente. **Completado total:** ambas entregas aceptadas, todas las pruebas, revisiones, recorrido conjunto, publicación autorizada y comprobación posterior. Documentos preparados no equivalen a implementación.

## 13. Ampliaciones excluidas y estado de este ajuste

Detalle de eliminatorias, alertas, exportaciones, espejo persistente, disponibilidad sin fuente, búsqueda avanzada de identidades y consolas de operaciones quedan fuera. Competencias **no** es una ampliación opcional: forma parte de la entrega 2 de la funcionalidad aprobada. Objetivos, recomendaciones y rankings conservan sus aplicaciones actuales.

Este ajuste solo modifica la spec y el plan: mantiene toda la cobertura de identidad/permisos, simplifica la operación administrativa y cierra presentación y orden de entrega. No se implementaron componentes/rutas, ejecutaron migraciones, confirmaron personas ni desplegaron cambios.
