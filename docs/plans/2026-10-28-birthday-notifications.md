# Birthday Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar el popup anual de cumpleaños al alumno y resaltar sus filas administrativas para facilitar un saludo manual.

**Architecture:** Calcular el cumpleaños en lectores de servidor con fecha de Lima; guardar el resultado diario y, por separado, el cierre por alumno/año. Ampliar el feed compatible y reutilizar diálogo, cola, lista y normalizador de teléfonos. Una generación programada a medianoche de Lima, recuperación excluyente y ajustes puntuales; sin bandeja administrativa ni envíos automáticos.

**Tech Stack:** Next.js App Router, React, TypeScript, TanStack Query, Supabase/PostgreSQL, Tailwind, Vitest, Testing Library y PGlite; PostgreSQL desechable con conexiones independientes para concurrencia.

---

Fecha: 28/10/2026. Estado: ejecución en desarrollo autorizada tras las decisiones finales del usuario. Producción y despliegue no autorizados. Referencia normativa: `docs/specs/2026-10-28-birthday-notifications.md` (spec corregida). Rutas relativas a `D:/PROGRAMACION/archery-reservas-pwa`.

Implementar y probar con base local desechable. No aplicar SQL a producción ni desplegar. Los comandos describen el procedimiento; el registro QA separa los ejecutados y sus resultados de las comprobaciones pendientes.

## Preparación y límites

- Al comenzar la ejecución futura, verificar rama, estado y cambios desde `3212799`; conservar archivos ajenos y seleccionar un checkout de trabajo adecuado. Revalidar contratos si cambió el repositorio.
- Leer `archery-pwa-v2`, `test-driven-development`, `verification-before-completion` y las guías de Supabase aplicables. Usar `executing-plans` para avanzar por tareas con revisión.
- Mantener el alcance de dos comportamientos. No modificar `app/admin/layout.tsx`, home ni `/admin/notificaciones` para agregar recepción administrativa.
- No exigir una cuenta nueva al tutor ni crear destinatarios para él. Mantener el contexto autorizado existente.
- La migración funcional y la configuración programada separada usan timestamps reales. La migración funcional lleva timestamp real de ejecución y sufijo `_student_birthday_notifications.sql`; no reutilizar un timestamp provisional al aplicarla en base real.

## Tarea 1. Contratos y calendario

**Crear:**
- `lib/contracts/studentBirthday.ts`.
- `lib/contracts/studentBirthday.ts` (validadores de calendario y vigencia; sin cálculo de aniversario en cliente).
- `lib/services/studentBirthdayService.test.ts` (contratos compartidos).

**Modificar:**
- `lib/utils/academyNotifications.ts` y `lib/utils/academyNotifications.test.ts`.

**Paso 1 — pruebas rojas.** Definir las formas `BirthdayCalendar`, `StudentBirthdayNotice` y `AdminStudentBirthdayFlags`, origen `birthday`, ID `birthday:{studentId}:{year}`, cierre confirmado anual y exclusión local por contexto/año/fecha de celebración. Probar el contrato añadido, su ausencia en servidores antiguos y rechazo de calendario/fecha incoherentes. Probar que la cola preserva orden manual, prioridad de vencimiento y cumpleaños antes de publicaciones manuales.

**Paso 2 — ejecutar.** `npx vitest run lib/utils/studentBirthday.test.ts lib/utils/academyNotifications.test.ts`. Debe fallar por contrato/helper nuevo ausente antes de implementarlo.

**Paso 3 — implementación mínima futura.** Implementar validadores del contrato, ID y frescura por duración monótona; no calcular «hoy» desde el dispositivo ni duplicar calendario de cumpleaños en cliente. El cálculo normativo de 29/02 se prueba en SQL en tarea 2. Mantener la ausencia de `birthday_version` como falta de soporte, no como error de avisos manuales.

**Paso 4 — verde y revisión.** Repetir el comando; comprobar todas las aserciones. Commit futuro sugerido: `feat(notifications): define birthday notice contracts`.

## Tarea 2. Resultado diario, cierre y operaciones SQL

**Crear:**
- `supabase/migrations/20261029040555_student_birthday_notifications.sql`.
- `tests/database/birthdayNotifications.test.ts`.
- `tests/database/fixtures/birthdayNotifications.bootstrap.sql`.

**Modificar:** ninguna migración histórica. Reemplazar funciones existentes solo mediante la nueva migración.

**Paso 1 — pruebas rojas SQL.** Montar PostgreSQL local mediante PGlite, siguiendo el patrón de `tests/database/studentAccountAccess.test.ts`, con roles `anon`, `authenticated` y relaciones de alumno/cuenta/tutor. Cargar la nueva migración desde disco; comprobar ejecución como roles, no solo `auth.uid()` simulado con privilegios de propietario. Preparar fixtures exclusivamente locales.

**Paso 2 — calendario.** Cubrir nacimiento nulo, futuro y no finito; aniversario normal; 29/02 en 2027, 2028, 2000 y 2100; año de celebración y límites de Lima. La función interna recibe referencia fija en pruebas. Los RPC productivos no aceptan una fecha «hoy» desde el cliente. Para escenarios públicos, crear nacimientos relativos a la fecha real de la base desechable o sustituir el reloj interno solo en esa base; nunca agregar un parámetro público de simulación.

**Paso 3 — modelo mínimo.** Crear `student_birthday_days` y `student_birthday_day_students` según spec; completado vacío distingue ausencia. Crear `student_birthday_dismissals` exactamente como sección 4 de la spec: PK alumno/año, fecha de celebración con año consistente, actor autenticado y timestamp servidor. Sin recepciones administrativas ni backfill histórico. Generador con bloqueo transaccional global: un solo barrido completado del día real. Trigger de nacimiento/estado con bloqueo compartido ajusta solo el alumno editado; el generador usa exclusivo; recuperación explícita autorizada antes de lectores STABLE. Probar integridad y reejecución de DDL preparado para un entorno parcialmente migrado.

**Paso 4 — lectores y cierre.** Implementar los contratos de sección 6:
- Helper `birthday_anniversary(date,date)`: interno y puro.
- Ampliación `get_student_notification_feed(uuid)`: mantener `notices`, `membership`, firma y permisos actuales; añadir versión, calendario y `birthday` separado. Mantener `STABLE` y sin escritura.
- `get_admin_student_birthday_flags(uuid[])`: consulta autorizada, límite 500, IDs deduplicados, tabla actual sin cierres, calendario y bool por ID autorizado existente. Mantener `STABLE`.
- `dismiss_student_birthday(uuid,integer,date)`: validar actor/contexto y payload; bloquear alumno, comprobar cierre anual previo y validar cumpleaños vigente antes de insertar. PK e inserción idempotente resuelven repetición. Seguir errores `42501`, `22023`, `BIRTHDAY_NOT_CURRENT` de la spec.

**Paso 5 — permisos.** RLS en tabla, sin permisos directos a clientes. Revocar ejecución pública/anónima de RPC y de helpers; helpers tampoco para `authenticated`. Funciones privilegiadas con búsqueda fija y verificaciones de perfil activo, rol y acceso. Comprobar alumno ajeno, guardian con/sin vínculo, admin, cuenta deshabilitada y manipulación de alumno/año/fecha. No revelar existencia de alumnos ajenos.

**Paso 6 — rojo/verde.** Ejecutar `npx vitest run tests/database/birthdayNotifications.test.ts`. Primero debe fallar por objetos inexistentes; después pasar calendario, permisos, correcciones y cierre. Verificar que ejecutar lectores no añade cierres ni toca membresías, reservas, pagos o perfiles. Commit futuro sugerido: `feat(database): add annual birthday dismissal and readers`.

## Tarea 3. Correcciones y concurrencia de cierre

**Ampliar:** `tests/database/birthdayNotifications.test.ts`.

**Crear:** `tests/database/runBirthdayConcurrency.mjs`.

**Paso 1 — matriz de correcciones.** Fixtures sin/con cierre anual para 28/10 → 05/11, hoy → ayer, ayer → hoy, eliminación, futuro, restauración válida, cambio solo del año de nacimiento y año de celebración siguiente. Comprobar feed y flags por separado: los flags ignoran cierres. El cierre anual se separa de la pertenencia diaria; el trigger puntual actualiza el resultado vigente sin otro barrido.

**Paso 2 — carrera real.** El runner usa `pg` ya disponible y `BIRTHDAY_TEST_DATABASE_URL`, exige una base desechable local (`localhost`/`127.0.0.1`) y aborta si apunta a una URL remota o configuración de producción. Crear conexiones separadas y fixture aislado; no basta con dos promesas sobre una sola conexión PGlite.

**Paso 3 — escenarios.** Dos cierres simultáneos producen una fila; cierre repetido devuelve éxito; cierre gana bloqueo antes de edición y queda conservado; edición gana primero y cierre antiguo devuelve `BIRTHDAY_NOT_CURRENT`; cambio de estado elimina elegibilidad; cierre confirmado del año anterior se reconoce como idempotente sin crear otros registros históricos. Limpiar solo los fixtures del esquema/base desechable identificados por el runner.

**Paso 4 — verificación futura.** `npx vitest run tests/database/birthdayNotifications.test.ts` y, con la variable local configurada, `node tests/database/runBirthdayConcurrency.mjs`. Esperado: matriz completa y carreras aprobadas. Si falta PostgreSQL desechable, dejar concurrencia pendiente; no reemplazarla por una afirmación basada en una prueba serial. Commit sugerido: `test(birthdays): verify corrections and concurrent dismissals`.

## Tarea 4. Servicios, vigencia y actualización

**Crear:**
- `lib/services/studentBirthdayService.ts` y `.test.ts`.
- `lib/hooks/useAdminStudentBirthdays.ts` y `.test.ts`.
- `lib/hooks/useBirthdayFreshness.ts` y `.test.ts`.

**Modificar:** `lib/services/academyNotificationService.ts` y `.test.ts`.

**Paso 1 — pruebas rojas.** Probar contratos/versiones, errores RPC, IDs, lotes de 500, respuestas de días distintos, rechazo de resultados tardíos y ausencia de permiso. Preparar timers falsos y reloj monótono controlado exclusivamente en tests de UI; no cambiar reloj del servidor o datos reales.

**Paso 2 — servicios.** Llamar a lectores y cierre con sus argumentos exactos. No enviar actor ni «hoy». El servicio del feed mantiene compatibilidad con ausencia de campos nuevos. Separar el dispatcher de cierre `academy`/`birthday`; nunca cerrar cumpleaños vía `dismiss_academy_notification`.

**Paso 3 — hooks.** Query keys con cuenta y alumno/IDs ordenados. Solicitar flags únicamente de filas renderizadas; entrada, foco, reconexión y cambio de día; sin sondeo nuevo. Preparación explícita antes de lectura, con estado no disponible si falta resultado. Sin datos de contexto anterior como placeholder. Ignorar respuesta de generación/contexto obsoleto aunque cancelar RPC no sea posible.

**Paso 4 — validez.** Usar `performance.now()` para medir duración de petición y agotar `valid_for_ms` conservadoramente. Retirar cumpleaños al vencer la validez sin usar reloj del dispositivo. Tras suspensión, ocultar y revalidar. Probar red caída, petición que cruza medianoche, reordenamiento y exclusión local que sobrevive a refetch. No interferir en publicaciones manuales por fallo aislado de flags.

**Paso 5 — verde.** `npx vitest run lib/services/studentBirthdayService.test.ts lib/services/academyNotificationService.test.ts lib/hooks/useAdminStudentBirthdays.test.ts lib/hooks/useBirthdayFreshness.test.ts`. Commit sugerido: `feat(birthdays): add scoped readers and freshness`.

## Tarea 5. Popup, cierre local y reintentos

**Modificar:**
- `components/student/StudentNotificationCenter.tsx` y `.test.ts`.
- `components/student/AcademyNoticeDialog.tsx`.

**Crear:** `components/student/StudentNotificationCenter.test.ts` (pruebas montadas del diálogo y la cola).

**Paso 1 — pruebas rojas.** Renderizar el centro con feed actual y ampliado: cola, vencimiento, cumpleaños, anuncios, última clase, entrada a medianoche y caducidad sin conexión. Probar respuestas lentas y cambio de alumno mientras hay consulta/cierre pendientes. La felicitación no crea avisos ni cuentas de tutor; únicamente usa el contexto existente.

**Paso 2 — diálogo.** Añadir prop opcional de etiqueta de acción con valor predeterminado `Entendido`; cumpleaños pasa `Gracias`. Mantener X, Escape, foco y controles de 44 px. No modificar textos/acción de renovación.

**Paso 3 — cola.** Conservar la captura `openingNotices` de manuales e introducir cumpleaños como candidato actualizado, validado y tipado fuera de esa captura. Un popup a la vez. Excluir localmente por cuenta/alumno/año/fecha de celebración en memoria de sesión, no por número de apertura; el cierre confirmado es anual. Probar que una fecha corregida distinta puede mostrarse al llegar si el cierre anterior falló, incluso sin cerrar la app. No resetear cierres locales al invalidar caché.

**Paso 4 — persistencia.** Ocultar antes de esperar la red. Reintentos transitorios limitados a 1, 5 y 15 s y por reconexión/apertura, previa revalidación; conservar el payload original. No reintentar acceso denegado o cumpleaños obsoleto. Si el proceso se cierra sin confirmación, se admite reaparición. Nunca notificar «guardado» ante fallo.

**Paso 5 — verde.** `npx vitest run components/student/StudentNotificationCenter.test.ts components/student/AcademyNoticeDialog.test.tsx lib/utils/academyNotifications.test.ts`. Resultado esperado: pruebas existentes y nuevas aprobadas, sin regresión de avisos manuales. Commit sugerido: `feat(student): show dismissible annual birthday greeting`.

## Tarea 6. Resaltado y contacto en la lista

**Modificar:** `app/admin/alumnos/page.tsx`.

**Crear:**
- `components/admin/StudentBirthdayBadge.tsx`.
- `components/admin/StudentBirthdayAction.tsx` y `StudentBirthdayAction.test.ts`.
- `lib/utils/studentBirthdayWhatsApp.ts` y `.test.ts`.
- `tests/app/adminStudentBirthdays.test.ts` (renderizado real con Testing Library).

**Reutilizar sin cambiar semántica:** `normalizeMembershipWhatsAppPhone` de `lib/utils/membershipRenewalWhatsApp.ts`; `MembershipRenewalAlertAction` continúa dedicado a renovación.

**Paso 1 — pruebas rojas.** Con la misma lista antes/después de aplicar flags, comprobar IDs y orden idénticos; filtro por estado/sede, búsqueda por nombre/DNI/teléfono y orden por nombre/vencimiento/estado. Si apareció paginación en el checkout de ejecución, probar misma página, totales y selección; no añadir paginación nueva.

**Paso 2 — fila/tarjeta.** Pasar mapa vigente a `DesktopStudentTable` y `MobileStudentList`, sin cambiar el filtrado o sort. Mostrar fondo/borde y etiqueta junto al nombre, no en sustitución del estado/renovación. Excluir alumnos inactivos de etiquetas y acciones aunque sean visibles por el filtro. No añadir contador o filtro de cumpleaños.

**Paso 3 — contacto mínimo.** Mostrar acción independiente solo para cumpleaños confirmado. Usar `student.phone`, normalizador y enlace con texto de la spec codificado, `target=_blank` y `rel=noopener noreferrer`. No reutilizar el texto o restricciones de renovación. Sin teléfono válido/único: enlace a ficha «Revisar contacto». No inferir teléfono de tutor ni utilizar soporte/pagos.

**Paso 4 — sin envío implícito.** Verificar que abrir WhatsApp no llama a ningún RPC/mutación, no marca leído/enviado y no retira la etiqueta. No construir una tabla de seguimiento.

**Paso 5 — refresco de página.** Mantener carga actual de filas/contactos, invalidaciones y consulta al foco, sin intervalo de 30 s; conservar query, sede, estado, orden y página si existe. No cambiar la periodicidad global de `useStudents()` para otras pantallas. Flags tienen consulta independiente y error discreto; no bloquear listado si fallan.

**Paso 6 — verde.** `npx vitest run tests/app/adminStudentBirthdays.test.tsx components/admin/StudentBirthdayAction.test.tsx lib/utils/studentBirthdayWhatsApp.test.ts lib/utils/adminStudentList.test.ts lib/utils/membershipRenewalWhatsApp.test.ts`. Commit sugerido: `feat(admin): highlight birthdays in student list`.

## Tarea 7. Invalidación tras editar nacimiento o estado

**Modificar:**
- `app/admin/alumnos/[id]/page.tsx`.
- `app/admin/alumnos/editar/[id]/page.tsx`.

**Crear:** `lib/utils/invalidateStudentBirthdays.test.ts` y helper `lib/utils/invalidateStudentBirthdays.ts`.

**Paso 1 — pruebas rojas.** Identificar guardados de nacimiento y cambios de estado en ambas rutas. Comprobar que cada operación exitosa invalida `studentKeys.all`, `student-notifications` para el alumno y la raíz de claves del nuevo lector administrativo. No invalidar como éxito si el guardado falla.

**Paso 2 — cambio mínimo.** Ampliar invalidaciones existentes, sin modificar payloads, permisos, contactos o cálculo de estado. Las correcciones externas se observan al consultar o recuperar foco; el trigger del servidor ajusta puntualmente la pertenencia diaria. No añadir realtime.

**Paso 3 — verde.** `npx vitest run tests/app/birthdayInvalidation.test.ts lib/queries/studentQueries.test.ts lib/utils/adminStudentList.test.ts`. Verificar que los cierres locales de la tarea 5 sobreviven a la invalidación. Commit sugerido: `fix(birthdays): refresh after student profile changes`.

## Tarea 8. Regresión y revisión visual

**Crear:** `docs/qa/2026-10-28-birthday-notifications.md`, al ejecutar pruebas futuras, con resultados reales, entorno y limitaciones.

**Paso 1 — comprobaciones completas.** Ejecutar `npm test`, `npm run lint`, `npm run build`; exigir salida correcta sin inferir éxito de un log parcial. Repetir concurrencia local de tarea 3. No arrancar builds sobre el directorio `.next` de un servidor en uso sin coordinarlo.

**Paso 2 — visual alumno.** En entorno local con fixtures, verificar 360 px y escritorio: saludo, Gracias/X/Escape, orden de cola, foco/retorno, lector de pantalla, ampliación 200 %, texto largo y sin animación forzada. Verificar expiración, respuesta tardía y pantalla suspendida al cambiar el día usando referencias de test, nunca nacimientos de producción.

**Paso 3 — visual admin.** Comprobar las dos representaciones, etiqueta sin depender de color, contacto válido/inválido, estado inactivo visible sin resaltado, combinación de alertas, búsquedas y navegación. El resaltado persiste al cerrar el popup del alumno. Abrir WhatsApp con un enlace controlado/inspeccionado sin enviar mensajes reales.

**Paso 4 — revisión.** Revisar contratos, permisos, carreras y alcance con `requesting-code-review`, antes de integrar. Registrar criterios 1–15 de la spec con evidencia y pendientes. No declarar completado si falta la prueba de concurrencia o de autorización.

## Tarea 9. Activación compatible y reversión (requiere autorización futura)

1. Presentar migración y resultados concretos. Solicitar permiso para base real y despliegue cuando corresponda; las instrucciones actuales no lo autorizan.
2. Aplicar solo la migración aprobada. No alterar nacimientos, insertar cierres o fabricar felicitaciones de alumnos reales. Comprobar objetos, permisos, lectores `STABLE` y ausencia de escrituras colaterales.
3. Con cliente anterior, comprobar que ignora `birthday` y conserva avisos manuales. No cambiar el array `notices` ni su RPC de cierre.
4. Publicar el cliente nuevo autorizado; verificar versión, alias y comportamiento. Con servidor anterior simulado localmente, no mostrar cumpleaños sin contrato compatible y mantener los avisos previos.
5. Configurar trabajo `student-birthdays-lima`, `0 5 * * *` en pg_cron UTC (00:00 Lima), con comprobación de zona, deduplicación por nombre y función interna. Probar sin sesiones abiertas y recuperar día ausente mediante operación explícita; no reescanear días completados. Comprobar flags administrativos independientemente de la apertura del alumno.
6. Si falla la publicación, volver al cliente anterior y conservar tabla/cierres/operaciones. No borrar cierres anuales ni modificar saldos para revertir. Si hay que suspender entrega en lectores, aplicar una corrección revisada/autorizada que devuelva cumpleaños nulo y flags vacíos, sin tocar avisos existentes.
7. Entregar estado separado: código preparado, esquema activado y cliente publicado. No afirmar envío por WhatsApp ni registrar el clic como felicitación enviada.

## Condición de entrega

Ambos comportamientos cumplen la sección 10 de la spec; permisos, correcciones y carreras están probados; avisos manuales y navegación administrativa siguen funcionando; QA móvil/escritorio tiene evidencia. No hay funcionalidad administrativa adicional; la única tarea programada es la generación diaria. Completar código, pruebas y revisión en desarrollo antes de solicitar autorización concreta de migración, configuración diaria y publicación.

## Decisiones finales que prevalecen sobre el plan anterior

- Solo `active`, `expired`, `paused` en ambos comportamientos. Inactivos sin resaltado.
- Tres tablas mínimas: resultado de procesamiento diario, miembros del resultado y cierres anuales.
- Generador interno sin fecha elegida por cliente, bloqueo global transaccional y marca completada en misma transacción; vacío completado no es fallo.
- `prepare_student_birthday_day` es una escritura explícita autorizada; el feed y flags permanecen STABLE y solo leen resultados de hoy.
- Trigger puntual en INSERT/UPDATE de nacimiento/estado, sin barrer otros alumnos. Conservar cierres anuales y carreras cierre/edición bajo bloqueo de alumno.
- Trabajo diario medianoche Lima con configuración separada, testeada localmente; no activarlo en producción en esta ejecución.
- No intervalos nuevos de alumnos/contactos. Calendario válido hasta medianoche: retirar solo cumpleaños, continuar cola e invalidar día al límite del servidor; foco tras suspensión antes de mostrar.
- Pruebas SQL desechables y concurrencia PostgreSQL de conexiones separadas; informar cualquier comprobación no ejecutada.

## Registro de ejecución y equivalencias

Ver `docs/qa/2026-10-28-birthday-notifications.md` para pruebas ejecutadas y revisión visual. Las pruebas del calendario SQL están en `tests/database/birthdayNotifications.test.ts`; no se creó un cálculo paralelo en TypeScript. Tipos y validadores comparten `lib/contracts/studentBirthday.ts`. El diálogo se prueba montado desde `StudentNotificationCenter.test.ts` y las invalidaciones desde el helper común. No se requieren dependencias nuevas.

Concurrencia adicional de revisión: actualización de varios alumnos frente a edición individual; generador que gana primero frente a edición y edición que gana primero frente al generador. El ajuste puntual usa advisory compartido y el generador exclusivo. Configuración concreta y reversión: `supabase/operations/student_birthday_cron.sql` y `student_birthday_cron_disable.sql`. La ejecución real del daemon pg_cron sigue pendiente por ausencia de extensión local, aunque el generador, sus bloqueos y el rechazo de configuración incompatible se verificaron.
