# Mi progreso — Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: usar `executing-plans` para ejecutar este plan por tareas y con revisión de los contratos antes de conectar datos reales. Este documento no autoriza su ejecución.

**Goal:** ofrecer al alumno/tutor controles y competencias de sus fuentes originales, con identidad confirmada, formatos separados y fallos independientes.

**Architecture:** APIs privadas de servidor por alumno y fuente, con caché de cinco minutos. Supabase conserva solo vínculos y auditoría de identidad; la web conserva controles y TE conserva resultados versionados. Sin extractor, espejo persistente de puntajes ni modificación de liga/rankings.

**Tech Stack:** PWA Next.js 14/React 18, Supabase Auth/PostgreSQL, React Query, Tailwind, Recharts y Vitest existentes; web Next.js/Turso; Tournament Engine Node.js/libSQL y contratos JSON existentes. No actualizar versiones como parte de la funcionalidad.

---

Fecha: 19 octubre 2026, America/Lima. Spec: [Mi progreso](../../docs/specs/2026-10-19-mi-progreso.md). Estado: plan propuesto, no ejecutado.

## 1. Fuentes y límites de ejecución

| Sistema | Raíz inspeccionada | Propiedad |
| --- | --- | --- |
| Reservas, workspace activo | `C:/Users/OMEN/.codex/worktrees/admin-ux-audit/archery-reservas-pwa` | Autenticación, alumno/tutor, distancia asignada, vínculos y UI |
| Web de academia | `D:/WEB ABSOLUTE ARCHERY` | `aa_academy_students` y todos los `aa_academy_controls` |
| Tournament Engine | `D:/Tournament Engine` | Competidores, participaciones, clasificaciones, resultados y versiones publicadas |

La PWA se inspeccionó en `cea6da3`. TE tiene cambios locales previos; no sobrescribirlos ni suponer que todo el árbol está desplegado. La web se inspeccionó como proyecto existente; no asumir una base Git limpia para publicarla. El checkout original de reservas permanece intacto.

**Hechos:** los modelos, campos, APIs existentes y observaciones reales están documentados en la sección 2 de la spec. **Propuestas:** todas las rutas, tipos, tablas, variables y archivos nuevos enumerados abajo todavía no existen. No ejecutar ahora scripts de migración/importación, escrituras de identidad, creación de credenciales o despliegues.

## 2. Dependencias y secuencia

Orden: contratos y decisiones → identidad/permisos PWA → lectores de web y TE → APIs de la PWA → UI → regresión/piloto → publicación autorizada. Los dos lectores de origen pueden desarrollarse independientemente después de acordar contratos; la UI puede trabajar con fixtures contractuales sin conectar bases reales.

Bloqueos de salida:

- Sin lector privado de controles no se cumple historial completo de alumnos privados ni revisiones/anulaciones. La API pública no es reemplazo suficiente.
- Sin consumidor/bridge TE propios no se habilita competencias; no tomar credenciales AS/AP.
- Sin confirmación administrativa no se muestra una identidad como enlazada.
- Sin URL documentada en TE, el enlace Origen queda ausente. Esto no bloquea los demás datos del MVP.

## 3. Tarea 0 — Cerrar contratos antes de programar

**Archivos de referencia:**

- Web: `D:/WEB ABSOLUTE ARCHERY/db/academy.sql`, `lib/academy/model.ts`, `lib/academy/store.ts`, `docs/RANKINGS-ACADEMIA.md`.
- TE: `D:/Tournament Engine/src/infrastructure/http/consumer-api.mjs`, `src/infrastructure/queries/libsql-read-model.mjs`, `contracts/tournament-engine-canonical-v1.schema.json`, `contracts/competition-mirror-snapshot-v2.schema.json`, `db/migrations/0001_foundation.sql`.
- PWA: `lib/hooks/useStudentContext.ts`, `lib/hooks/useStudentDashboard.ts`, `app/api/admin/create-student/route.ts`, helpers de acceso de Supabase.

**Entregables futuros propuestos:** schemas `academy-student-controls-v1` y `te-academy-individual-progress-v1`, ejemplos mínimos y de ausencia/error, política de vínculos y lectura privada. Acordar estos contratos con los propietarios de las fuentes antes de dar por terminado el diseño técnico.

Pasos:

1. Fijar en los schemas los campos reales de la spec y la procedencia de cada campo. Separar propiedades de transporte nuevas de propiedades deportivas originales.
2. Definir snapshot completo por alumno para controles, incluidos `annulled`, `revision`, fecha deportiva y hora nullable. Definir `complete`, instante de consulta y la conducta si se excede un límite: paginar con cursor estable o fallar explícitamente; nunca truncar silenciosamente.
3. Definir history/dataset para consumidor TE `academy`, namespace `academy_reservas_student`, categorías individuales, posición de clasificación/final y bajas de versiones. Proyectar solo datos necesarios, sin copiar todo el dataset nacional ni datos personales del competidor.
4. Confirmar que la privacidad pública `visible=0` no impedirá al alumno vinculado acceder privadamente a su historial. Hasta entonces tratarlo como decisión pendiente, no como autorización ya existente.
5. Confirmar responsable y procedimiento para crear/revocar bridges TE en el namespace nuevo. Puede ser un paso operativo administrativo de identidad; no exige ingresar puntajes ni construir otro importador.
6. Ratificar distancia asignada como dato de PWA y presentación explícita de discrepancias, sin sincronización automática de distancia.
7. Establecer que URL de origen es opcional y verificable. No introducir una plantilla supuesta de Ianseo; si se añade procedencia URL, la genera/documenta TE y se versiona su contrato.

**Salida comprobable:** ejemplos válidos para 36, 72, hora desconocida, anulaciones, total_only, clasificación ausente, posiciones alternativas, sujeto sin datos y fuente fallida; cada campo apunta a un campo real o se marca derivado/de transporte. Ninguna identidad real se modifica para validar estos ejemplos.

## 4. Tarea 1 — Vínculos, auditoría y autorización de la PWA

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
5. Añadir panel administrativo mínimo con IDs y evidencia, búsqueda como ayuda y confirmación explícita. Mostrar pendiente si falta confirmar el bridge TE. No autovincular por nombre, distancia o categoría.
6. Definir revocación y sustitución con invalidación de caché. No eliminar evidencia histórica ni reasignar un ID confirmado de otra persona silenciosamente.
7. Ejecutar pruebas positivas/negativas y revisión de seguridad. Commit independiente de esquema/identidad, sin aplicar a la base real hasta autorización de esa acción.

**Resultado esperado:** acceso propio y de tutor autorizado; 401 sin sesión, 403 para alumno ajeno; alumno/tutor no pueden confirmar vínculos; conflicto de ID rechazado; auditoría consistente aun con fallos y concurrencia.

## 5. Tarea 2 — Lector privado de controles en la web

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

## 6. Tarea 3 — Consumidor propio de reservas en Tournament Engine

**Archivos en `D:/Tournament Engine`:**

- Modificar `src/infrastructure/http/consumer-api.mjs` y, solo si es necesario, `api/v1/consumer.mjs`.
- Crear `src/infrastructure/queries/academy-progress-read-model.mjs` y `contracts/academy-individual-progress-v1.schema.json`.
- Ampliar validación de contratos en `src/contracts/index.mjs` y pruebas de contrato/integración.
- Crear una operación de identidad del propietario de TE, propuesta `scripts/confirm-academy-student-bridge.mjs`, con pruebas y modo de inspección. No ejecutar sobre personas reales durante desarrollo.
- Documentar la credencial propia propuesta `TE_ACADEMY_API_TOKEN`. No cambiar ni copiar las de AS/AP.

Pasos:

1. Escribir pruebas de consumidor academy: Bearer propio, tokens de otros consumidores rechazados, bridge confirmado del namespace correcto, IDs ajenos/AS denegados y métodos distintos de GET denegados en el lector.
2. Añadir fixtures de versiones publicadas/sustituidas/retiradas, dos páginas de history, clasificación con rank nullable y ranking explícito, total_only, varias distancias, cero flechas no interpretable, participación sin clasificación y final oficial/provisional.
3. Ejecutar pruebas y confirmar fallo antes de implementar el consumidor. No correr scripts llamados import/publish/migrate sobre la base real para probarlo.
4. Implementar history y dataset con consultas de solo lectura y guard de bridge propio. Filtrar `event_type=individual`; conservar IDs/versiones/estados originales. El resto de consumidores debe mantener su contrato y comportamiento.
5. Implementar proyección mínima contractual. Reutilizar entidades canónicas; no reconstruir Ianseo, sumar sets como clasificación, cambiar puntuaciones ni completar datos ausentes.
6. Implementar confirmación/revocación administrativa del bridge, separada de la credencial de lectura. Solo tras comprobar identidad; guardar evidencia según política del propietario. La función existente `addConfirmedBridge` no se reutiliza tal cual porque fija `as_athlete`.
7. Ejecutar `npm run test:contracts`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, `npm run security:secrets`, con entorno aislado. Revisar que ninguna prueba esté configurada para escribir en producción.
8. Preparar publicación aditiva de API/contrato. No reprocesar torneos ni modificar versiones, RAW o resultados para habilitar el consumidor.

**Resultado esperado:** academy solo lee sujetos con su bridge; AS/AP siguen pasando su regresión. El consumidor nuevo no devuelve competidores nacionales completos ni datos personales innecesarios.

## 7. Tarea 4 — APIs privadas y proyección deportiva en la PWA

**Crear, nombres propuestos:**

- `app/api/student-progress/training/route.ts`.
- `app/api/student-progress/competitions/route.ts`.
- `lib/server/studentProgress/academyClient.ts`, `engineClient.ts`, `cache.ts`.
- `lib/utils/studentTrainingProgress.ts`, `lib/utils/studentCompetitionProgress.ts`, `lib/contracts/studentProgress.ts`.
- Pruebas de rutas, clientes y reglas junto a estos módulos.

Variables de servidor propuestas: `ACADEMY_CONTROLS_URL`, `ACADEMY_CONTROLS_READ_TOKEN`, `TOURNAMENT_ENGINE_URL`, `TOURNAMENT_ENGINE_ACADEMY_TOKEN`. Son configuración futura, no variables que se hayan añadido. Verificar origen/protocolo permitido; no aceptar una URL enviada por el navegador ni reenviar credenciales a redirecciones.

Pasos:

1. Escribir pruebas del resumen: último 280/360 posterior a mejor 305/360; mejor de 72 aparte; asignación 30 m con último global 20 m; cambio de distancia; fechas sin hora; corrección/anulación y puntaje cero documentado.
2. Escribir pruebas de proyección de competencia: puesto de clasificación/final separados; alternativa explícita `ranking_entries`; conflicto entre fuentes de posición; eventos sin clasificación; segmentos múltiples y total_only; ningún enlace si falta URL.
3. Probar permisos antes de caché/orígenes. Espiar adaptadores solo para demostrar que no se llaman con JWT/alumno inválidos; las reglas deportivas se prueban con datos reales de contrato, sin mocks de la implementación.
4. Ejecutar `npx vitest run` sobre esos archivos y observar fallos previstos. Implementar después las reglas mínimas de la spec y validación de respuestas.
5. Implementar clientes con timeout inicial propuesto de 8 segundos por petición, cancelación, límites de páginas y cursores repetidos detectados. Diferenciar 401/403, 404 concluyente, respuesta incompleta y fallo de red. No convertir errores en arrays vacíos.
6. Controles: snapshot completo, proyección por ID/revisión y exclusión de anulados de métricas. Lista puede conservarlos etiquetados, sin motivo privado. Resumen vitalicio de distancia asignada separado de filtros del historial.
7. TE: recorrer history para todos los IDs confirmados, cargar versiones actuales y combinar por IDs canónicos. Reemplazar la proyección del dataset al cambiar de versión; nunca anexar una nueva competencia por cada consulta o `snapshot_id`. Si una parte falla, declarar cobertura parcial.
8. Implementar caché de origen de cinco minutos con revisión del vínculo y timestamps reales. Evaluar autorización/enlace en cada llamada antes de reutilizarla. HTTP al navegador `private, no-store`. No usar caché por nombre ni almacenar tokens en payloads/logs.
9. Exponer estados independientes: pending_link, empty, ready, partial, unavailable y forbidden, con metadatos mínimos. No añadir un endpoint combinado que haga fallar ambas fuentes por un único error.
10. Pasar pruebas; commit de API/adaptadores. No necesita crear tablas de puntajes, Cron o colas.

## 8. Tarea 5 — Interfaz Mi progreso

**Crear en PWA, nombres propuestos:**

- `app/mi-progreso/page.tsx`.
- `components/student/progress/ProgressSummary.tsx`, `TrainingHistory.tsx`, `TrainingEvolutionChart.tsx`, `CompetitionHistory.tsx`, `ProgressSourceState.tsx`.
- `lib/hooks/useStudentProgress.ts`, `lib/services/studentProgressService.ts`.
- Pruebas de estados, accesibilidad, filtros y cambio de alumno.

**Modificar:** `app/page.tsx` para tarjeta Mi progreso; `lib/utils/studentNavigation.ts` y su prueba para no marcar Inicio falsamente en esa página. Reutilizar `MobileStudentHeader`, `StudentCard`, `AuthGuard`, soporte, shell adaptable y React Query existentes. Conservar las cuatro pestañas inferiores, reservas y membresías.

Pasos:

1. Escribir pruebas del cambio de alumno: el primero termina tarde, el segundo no recibe sus datos; cada fuente conserva estado y caché propia. Añadir cierre/cambio de cuenta y vínculo revocado.
2. Añadir fixtures de todos los estados de la spec y renderizar la página con ambas fuentes independientes, antes de implementar su vista final.
3. Implementar entrada, header con alumno seleccionado y resumen. La discrepancia de distancia se explica sin sugerir que se cambió el origen.
4. Implementar filtros distancia/flechas/fechas y lista de diez después de filtrar. El conteo y la gráfica usan todo el filtro. Anular o corregir un intento no mueve la fecha deportiva a `updated_at`.
5. Usar Recharts ya instalado para 36 y 72 en gráficas separadas; sin porcentajes ni conversión de puntajes. Añadir alternativa tabular y acceso a intentos que coinciden en fecha/puntaje.
6. Implementar competencias individuales con tarjetas/filas adaptables y dos puestos rotulados. No añadir gráfica conjunta de competencia/entrenamiento ni panel de eliminatorias.
7. Mostrar Consultado el… por fuente. Revalidar al abrir/reanudar y cada cinco minutos solo mientras esté visible; reintento controlado. No mostrar los puntajes caducados de una fuente fallida como resultado vigente.
8. Verificar etiquetas, teclado, foco, un h1, contraste, targets táctiles y ausencia de desbordamiento a 320/390/1440 px. Comprobar que las otras rutas siguen accesibles.
9. Pasar pruebas focales, revisión de diseño y commit de UI. No solicitar acceso de cámara, ubicación ni permisos adicionales al alumno.

## 9. Matriz mínima de pruebas de aceptación

Fixtures de ejemplo son sintéticos. Ninguno autoriza crear datos en las bases reales.

| Caso | Verificación obligatoria |
| --- | --- |
| Último frente a mejor | 305/360 anterior y 280/360 posterior a 30 m: último 280, mejor 305 |
| Cambio/discrepancia de distancia | Asignada 30, historial 20; 20 permanece filtrable, no se mueve ni se actualiza asignación. Último global distinto se informa |
| Formatos | 305/360 y 600/720: dos mejores, dos series/ejes independientes; no aparece 600 en una escala de 360 |
| Fecha/hora desconocida | Fecha civil conserva día Lima; hora null no se transforma en medianoche; orden del mismo día incierto queda indicado |
| Corrección | Mismo control, revisión 1→2, cambia puntaje y fecha si lo corrigió la fuente; una sola fila de identidad; recalcular último y mejor |
| Anulación | Mejor marca pasa a annulled: desaparece de métrica/gráfica y aparece anulado en historial si se presenta; nunca cero ficticio |
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

## 10. Tarea 6 — Verificación integrada y piloto

1. Releer criterios de la spec y esta matriz. Cada criterio tendrá prueba/evidencia y responsable; un test estático de texto no sustituye una prueba de permisos o cálculo.
2. PWA: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. Ejecutar pruebas SQL aisladas de RLS/vínculos. Añadir pruebas nuevas a los scripts existentes sin retirar regresiones.
3. Web: regresión academy/league, lint, typecheck y build; comparar que los GET públicos no cambian por introducir el lector privado.
4. TE: contratos, integración y seguridad; comprobar AS/AP además de academy. No ejecutar importadores reales dentro de una verificación genérica.
5. Conectar preview/staging con fuentes de prueba y vínculos sintéticos. Verificar navegador → API PWA → autorización → fuente → proyección → pantalla, incluidos fallos independientes y cambio de tutor.
6. Después de autorización, piloto de solo lectura con identidades confirmadas de pocos alumnos. Contrastar controles por IDs/revisiones y competencias por versiones/participaciones, sin publicar capturas identificables ni escribir puntajes para probar.
7. Revisar tiempos y tamaño de payload. Si los límites propuestos no cubren un historial completo, resolver paginación/contrato; no ocultar el exceso tras un corte silencioso ni importar todo el país.
8. Registrar evidencia en un futuro `docs/qa/mi-progreso-acceptance.md`: entorno, versiones de cada sistema, casos, resultados, datos ausentes, límites y decisión de publicación.

## 11. Publicación y reversión — solo en una ejecución futura autorizada

**Preparación:** revisión de contratos, pruebas aprobadas, respaldo del esquema/metadatos necesario y registro de cambios de cada sistema. Proponer un interruptor de servidor `STUDENT_PROGRESS_ENABLED`, inicialmente desactivado. No instalar otra plataforma de flags para este MVP.

**Orden de publicación:**

1. Publicar lectores nuevos de web y TE de forma aditiva, con credenciales independientes y privilegios mínimos. No activar el nuevo acceso mediante tokens AS/AP.
2. Aplicar migración de vínculos/RLS en reservas tras preparar, probar, revisar y autorizar esa acción sobre la base real. Confirmar esquema y ejecutar lectura negativa de acceso.
3. Configurar secretos de servidor fuera de Git y comprobar autenticación; nunca copiarlos a preview sin decidir expresamente el acceso que tendrá ese entorno.
4. Confirmar identidades piloto y bridges propios con evidencia y autorización administrativa. No realizar matching automático ni cambiar distancias o puntajes.
5. Publicar frontend con interruptor desactivado, verificar rutas anteriores y después habilitar el piloto. Comprobar los casos de negocio y permisos antes de extenderlo al resto de alumnos.
6. Monitorizar por fuente errores, latencia, cobertura de vínculos y consultas completas; registros con IDs técnicos mínimos, sin payload deportivo íntegro, nombres o secretos.

**Reversión:** desactivar el interruptor y ocultar la entrada de Mi progreso; restaurar el frontend/API anterior de la PWA si procede. Invalidar cachés privadas de progreso y revocar solo sus credenciales si hay un problema de acceso. Si falla un lector de origen, revertir ese despliegue aditivo sin alterar contratos AS/AP ni APIs públicas de academia. Conservar vínculos y auditoría en tablas inertes; no borrar tablas ni datos deportivos para revertir UI. La ausencia de un espejo de puntajes evita un rollback de resultados.

**Definición de completado futura:** todos los criterios de la spec verificados, fuentes y vínculos operativos, revisión de seguridad resuelta, recorrido visual móvil/escritorio, regresión sin cambios de negocio, publicación autorizada y comprobación posterior. Documentos preparados no equivalen a funcionalidad implementada.

## 12. Ampliaciones fuera del MVP

Detalle de eliminatorias con sets/acumulativos/desempates, alertas, exportaciones, sincronización persistente o disponibilidad sin fuente, y herramientas avanzadas de búsqueda de identidades. Requieren decisión independiente. Objetivos, recomendaciones y rankings permanecen en sus aplicaciones actuales.

## 13. Estado al entregar este plan

Solo se realizaron lecturas e inspección y se redactaron documentos. No se creó ninguna de las rutas, tablas, variables o componentes propuestos, no se confirmó ninguna persona, no se ejecutó este plan y no se desplegaron cambios.
