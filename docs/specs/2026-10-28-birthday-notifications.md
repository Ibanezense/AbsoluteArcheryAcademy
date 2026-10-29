# Spec: cumpleaños del alumno

Fecha: 28 de octubre de 2026 · America/Lima.
Estado: arquitectura final e implementación preparada en desarrollo. Verificaciones y limitaciones en `docs/qa/2026-10-28-birthday-notifications.md`. Migración y programación activadas tras autorización; publicación en curso.

## 1. Objetivo y límites

Cubrir exactamente dos comportamientos:

1. Felicitación mediante el popup existente en el contexto autorizado del alumno, únicamente el día de su cumpleaños y hasta un cierre anual confirmado.
2. Resaltado y etiqueta «🎂 Cumpleaños hoy» en las filas y tarjetas de la lista administrativa de alumnos, para facilitar un saludo manual por WhatsApp.

No incluir popup administrativo, bloque en el inicio, apartado en `/admin/notificaciones`, historial administrativo, recepciones administrativas, contadores/filtros de fechas ausentes ni seguimiento de saludos enviados. Estas funciones quedan fuera del producto y del plan, sin fases posteriores reservadas. Tampoco incluir push, correos, mensajes automáticos, regalos o cambios de membresía.

No crear destinatarios ni avisos dirigidos a tutores. El contexto de alumno que un tutor ya tiene autorizado conserva sus reglas existentes; no se añade ningún flujo de tutor, canal, texto ni envío a su cuenta.

## 2. Hechos comprobados y decisiones

Inspección local del checkout `3212799`, el 28/10/2026; no se inspeccionó ni cambió la base real para esta revisión.

| Hecho comprobado | Fuente real |
| --- | --- |
| El nacimiento académico es `students.date_of_birth`, tipo `date`. | `supabase/migrations/20260227_create_v2_core_entities.sql` |
| La cuenta y el alumno son entidades diferentes; hay acceso contextual autorizado. | `lib/hooks/useStudentContext.ts`, función `can_access_student(uuid)` |
| El acceso individual admite `operational_status` `active`, `expired`, `paused` y respeta `account_access_blocked`; `profiles.is_active` controla la cuenta. | `supabase/migrations/20261021191039_student_account_access_policy.sql` |
| Estados protegidos reales: `inactive`, `retired`, `withdrawn`, `blocked`, `suspended`. «Por vencer» es una presentación derivada, no otro estado persistido. | `lib/queries/studentQueries.ts`, `lib/utils/studentOperationalStatus.ts` |
| Hay un feed JSON, cierre de avisos manuales y cola con prioridad de membresía vencida. El lector está declarado `STABLE`. | `supabase/migrations/20261021024214_academy_notifications.sql`, `lib/utils/academyNotifications.ts` |
| El centro consulta al entrar, al recuperar foco y cada 30 s; además fija los avisos manuales por apertura. El diálogo tiene X y Escape. | `components/student/StudentNotificationCenter.tsx`, `components/student/AcademyNoticeDialog.tsx` |
| La lista usa `useStudents()`, consulta directa a `students`, búsqueda y filtros locales, orden y dos representaciones. No tiene paginación explícita en este checkout. | `lib/queries/studentQueries.ts`, `lib/utils/adminStudentList.ts`, `app/admin/alumnos/page.tsx` |
| Existe WhatsApp para renovación, condicionado a ese aviso y a ciertos estados; no es una acción genérica de cumpleaños. Usa el teléfono registrado del alumno. | `components/admin/MembershipRenewalAlertAction.tsx` |
| Hay normalización de teléfonos peruanos/internacionales y URL con texto codificado. La lista no carga teléfonos de tutores. | `lib/utils/membershipRenewalWhatsApp.ts`, `lib/queries/studentQueries.ts` |

Las tablas y operaciones nuevas descritas aquí están implementadas en la migración local `20261029040555_student_birthday_notifications.sql`; activadas posteriormente con autorización; ver registro QA. Los hechos de la tabla anterior corresponden al código previo a la implementación.

## 3. Calendario y elegibilidad

Fuente única: `students.date_of_birth`. Nunca usar `profiles`, controles o Tournament Engine para completar nacimientos.

El servidor obtiene `today_lima = (now() AT TIME ZONE 'America/Lima')::date`. Para un nacimiento válido y no futuro, construye el aniversario del año de `today_lima`, con excepción del 29 de febrero: en año no bisiesto corresponde al 28 de febrero. Comparar fechas, sin convertir el nacimiento a una medianoche del dispositivo. Sin fecha, valor inválido o fecha futura: sin cumpleaños. PostgreSQL `date` ya impide fechas imposibles; rechazar/omitir también fechas no finitas y futuras en contratos. No reparar datos existentes automáticamente.

**Popup:** sesión de cuenta habilitada (`profiles.is_active = true`), rol `student` o `guardian`, `can_access_student(p_student_id) = true` y alumno con `students.operational_status IN ('active','expired','paused')`. Para la cuenta individual de rol `student`, respetar además `account_access_blocked = false`; para `guardian`, conservar el acceso contextual existente sin derivarlo de la cuenta individual del alumno. No exigir cuenta propia al alumno accedido desde un contexto ya autorizado. No usar `students.is_active` ni membresía/saldo como sustitutos de estas reglas. Los estados protegidos quedan excluidos del popup. Una cuenta admin no recibe este popup.

**Resaltado administrativo:** administrador autenticado y habilitado, con permiso actual de lista. Resaltar únicamente filas visibles cuyo `operational_status` persistido sea `active`, `expired` o `paused` y que pertenezcan al resultado vigente. Excluir `inactive`, `retired`, `withdrawn`, `blocked`, `suspended` y estados desconocidos. Un bloqueo de acceso individual no cambia por sí solo la categoría operativa: no habilita el popup, pero no altera la lista autorizada del administrador. No excluir ni añadir alumnos a la lista por este motivo. No depender de cierres, eventos ni aperturas de la app.

## 4. Resultado diario compartido y cierre anual separado

La comprobación general se ejecuta diariamente a las 00:00 de America/Lima, incluso sin sesiones abiertas. En pg_cron con zona UTC corresponde a `0 5 * * *`. La configuración debe comprobar la zona del programador, evitar trabajos duplicados y fallar de forma explícita si no corresponde; no asumir la zona del host.

Modelo mínimo adicional: `student_birthday_days` (`local_date` date PK, `completed_at` timestamptz) y `student_birthday_day_students` (`local_date`, `student_id`; PK compuesta y FK al día). El día completado, incluso con cero alumnos, es distinto de un resultado inexistente. No almacenar recepciones administrativas, edad o datos de contacto. No ofrecer historial. Los lectores seleccionan exclusivamente el día actual de Lima y sus miembros guardados; no recorren alumnos para calcular aniversarios. Los joins puntuales por IDs autorizados conservan el control de acceso y elegibilidad.

Generador interno `ensure_student_birthday_day()` sin fecha elegida por cliente: adquirir bloqueo transaccional global, volver a comprobar el día y si ya está completado devolverlo sin otro barrido. Si falta, recorrer alumnos una sola vez, insertar únicamente `active`/`expired`/`paused` que cumplen hoy y marcar completado en la misma transacción. Fallo: rollback completo; otro intento puede repetir el trabajo no completado. Varias ejecuciones concurrentes convergen en un resultado. No servir ayer como hoy.

Recuperación: `prepare_student_birthday_day(p_student_id uuid DEFAULT NULL)` es una escritura explícita separada del feed `STABLE`. Exige cuenta habilitada: alumno/contexto autorizado para rol student/guardian; admin habilitado para contexto administrativo. Llama al generador limitado al día real; devuelve `{ready, today_lima}`. El cliente la invoca al entrar, recuperar foco o cambiar de día antes del lector; varias invocaciones no repiten un procesamiento completado. Cron usa la función interna revocada a clientes. Lecturas habituales solo consultan resultados; no regeneran ni escriben.

Trigger puntual de `students` tras INSERT o UPDATE OF date_of_birth, operational_status: bajo bloqueo compartido de la misma clave (el generador conserva bloqueo exclusivo), si el día ya está completado, recalcular únicamente NEW.id e insertar/eliminar su pertenencia vigente. Si el día todavía no existe, no generar desde la edición: la siguiente preparación general lo incluirá. No barrer otros alumnos. Cierre y edición serializan por fila de alumno; no adquirir bloqueos de alumnos desde el barrido general para evitar inversión con el trigger.

Tabla y funciones con RLS/revocaciones como las de cierres. Mantener únicamente resultados de consulta del día; filas pasadas no se entregan ni constituyen una UI de historial. Su limpieza técnica, si se añade al trabajo diario, nunca borra cierres anuales.

### Tabla propuesta `student_birthday_dismissals`

- `student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE`.
- `celebration_year integer NOT NULL CHECK (celebration_year BETWEEN 1 AND 9999)`.
- `celebration_on date NOT NULL`, fecha reconocida al confirmar el cierre.
- `closed_by_profile_id uuid NOT NULL REFERENCES profiles(id)`.
- `closed_at timestamptz NOT NULL DEFAULT now()`.
- Clave primaria `(student_id, celebration_year)` y comprobación `EXTRACT(YEAR FROM celebration_on) = celebration_year`.

La fecha del cierre no cambia por correcciones posteriores. No almacenar fecha completa de nacimiento, edad, banderas de saludo enviado ni lecturas administrativas. Mantener claves anuales; borrar cierres permitiría reenviar en ese año. No modificar ni purgar los de años anteriores.

RLS habilitada. Revocar todo acceso directo de `PUBLIC`, `anon` y `authenticated`; no necesita SELECT directo ni políticas permisivas. El lector y el cierre acceden mediante funciones autorizadas. Ninguna clave privilegiada llega al navegador. Las funciones privilegiadas fijan `search_path`, comprueban cuenta y contexto explícitamente y revocan ejecución pública/anónima. Los helpers internos no son ejecutables por `authenticated`.

## 5. Correcciones del nacimiento: política explícita

El ID calculado es `birthday:{student_id}:{celebration_year}`. La fecha visible es `celebration_on`, no una parte del ID. La clave anual del cierre tiene la misma identidad.

- Sin cierre confirmado: el trigger puntual corrige la pertenencia del alumno al día vigente y el feed consulta ese resultado. Si se corrigió del 28/10 al 05/11, deja de entregar el saludo del 28/10 en la siguiente consulta y entrega el del 05/11 cuando llegue ese día, con el mismo ID anual. Se reutiliza la celebración lógica sin mutar un evento inexistente.
- Con cierre confirmado el 28/10: si se corrige al 05/11, no volver a mostrar el popup ese año. El cierre anual permanece intacto.
- Corrección hacia un día anterior a hoy: retirar el saludo actual y no mostrar uno atrasado. Corrección de una fecha pasada a hoy sin cierre anual: permitirlo hoy.
- Eliminación, fecha futura o estado no elegible: retirar el popup en la siguiente consulta; conservar el cierre si existía.
- Volver a una fecha válida del mismo año no elimina el cierre. Si solo hubo cierre local fallido, no se considera cierre anual confirmado: puede reintentarse según sección 9.
- Cambio de año: usar otra clave; el cierre del año anterior nunca bloquea el nuevo. Ajustar el año de nacimiento no borra cierres ni habilita otro saludo en el mismo año de celebración.
- El resaltado siempre sigue el nacimiento vigente y el día del servidor, con independencia de estos cierres.

## 6. Contratos de servidor

### A. Helper interno de calendario

`birthday_anniversary(p_date_of_birth date, p_reference_date date) RETURNS date`.

Función pura para resolver aniversario y validación, reutilizada por ambos lectores y por el cierre. Devuelve NULL si el nacimiento es nulo, no finito o posterior a la referencia. No exponerla como un mecanismo para que el cliente elija «hoy». En pruebas desechables puede recibir fechas fijas; los RPC públicos pasan exclusivamente la fecha real de Lima.

### B. Ampliación de `get_student_notification_feed(p_student_id uuid) RETURNS jsonb`

Parámetro y campos actuales `notices` y `membership` sin cambios. Añadir:

- `birthday_version: 1` para detectar soporte.
- `calendar: { today_lima: 'YYYY-MM-DD', valid_for_ms: number }`. Duración calculada en servidor hasta la siguiente medianoche local, sin sondeo adicional frecuente.
- `birthday_ready: boolean`: false distingue resultado diario ausente de ausencia de cumpleaños.
- `birthday: null | { id, source: 'birthday', celebration_year, celebration_on, title, body }`.

Devuelve `birthday = null` si hoy no corresponde, no es elegible o hay cierre anual. Conserva el rechazo de contexto no autorizado del feed actual. Título: «¡Feliz cumpleaños, {nombre}!»; cuerpo: «Todo el equipo de Absolute Archery te desea un gran día. ¡Que este nuevo año venga con muchas flechas al centro!». Sin edad ni fecha completa de nacimiento.

El cliente valida el objeto nuevo y usa un origen tipado `birthday` o `academy` para dirigir el cierre. Para avisos manuales, la ausencia histórica de origen equivale a `academy`. Nunca insertar el cumpleaños dentro de `notices`: los clientes antiguos intentarían cerrarlo como publicación manual. Un cliente antiguo ignora los campos añadidos; uno nuevo frente al esquema anterior conserva los avisos actuales y no muestra cumpleaños sin `birthday_version = 1` y calendario válido.

### C. Nuevo cierre `dismiss_student_birthday(p_student_id uuid, p_celebration_year integer, p_celebration_on date) RETURNS jsonb`

El cliente envía el año y fecha del objeto mostrado; no envía actor ni fecha de cierre. Validar sesión habilitada, rol y contexto con las mismas reglas del feed. Nunca permite cerrar por otro alumno sin acceso.

1. Bloquear la fila del alumno `FOR UPDATE` para serializar con la edición de nacimiento/estado.
2. Si ya existe cierre para alumno/año, devolver `{ success: true, already_closed: true, celebration_year }` sin alterarlo, tras validar acceso. Un reintento de un cierre anterior ya confirmado puede responder así después del cambio de año; no crea cierres históricos.
3. Si no existe, exigir año actual de Lima, elegibilidad, pertenencia guardada al día actual (ya ajustada por trigger) y `p_celebration_on` igual a esa fecha. Insertar con la clave única; llamadas concurrentes convergen en un cierre.
4. Devolver `{ success: true, already_closed: false, celebration_year }` para la inserción ganadora; un conflicto resuelto responde `already_closed: true`.

Si el nacimiento se cambió antes de adquirir el bloqueo, rechazar el cierre obsoleto; si se cambia después del cierre confirmado, conservarlo según la regla anual.

Errores SQLSTATE propuestos: `42501` para acceso denegado; `22023` para parámetros nulos/inválidos; `P0001` con mensaje estable `BIRTHDAY_NOT_CURRENT` para celebración que ya no corresponde y no tiene cierre previo. Ante este último error, descartar el intento local pendiente y refrescar; no insertarlo el día corregido. No revelar si existe un alumno inaccesible.

### D. Nuevo lector `get_admin_student_birthday_flags(p_student_ids uuid[]) RETURNS jsonb`

Requiere cuenta `profiles.role = 'admin'`, `profiles.is_active = true` y permiso vigente de lista. Consulta pertenencia guardada del día actual con elegibilidad vigente por ID. No calcula aniversarios, no consulta cierres ni crea nada.

Respuesta: `{ ready: boolean, calendar: { today_lima, valid_for_ms }, students: [{ student_id, is_birthday_today: boolean }] }`, un registro por ID existente y autorizado solicitado. `[]` devuelve lista vacía y calendario; IDs duplicados se deduplican; IDs desconocidos se omiten; ID nulo, array nulo o más de 500 IDs: `22023`. Rol/cuenta incorrectos: `42501`. No devolver edad, contactos ni fechas de nacimiento.

Enviar únicamente IDs de filas actualmente renderizadas. Si hay más de 500, dividir en lotes y aceptar únicamente resultados consistentes con el mismo `today_lima`; al detectar cambio de día, descartar el lote anterior y volver a consultar. La ausencia de un ID o fallo nunca significa «no cumple»: no mostrar un resaltado sin confirmación.

No cambiar `useStudents()` de una consulta a otra ni alterar su forma de respuesta. Cualquier paginación que exista al ejecutar el plan debe conservarse: aplicar flags solo a las filas ya seleccionadas.

### Permisos y compatibilidad

Las dos funciones de lectura y el cierre exponen únicamente el alcance autorizado. Helpers sin permisos públicos. Funciones nuevas con `REVOKE ... FROM PUBLIC, anon` y `GRANT EXECUTE ... TO authenticated`; toda función privilegiada vuelve a validar autorización en servidor. La tabla de cierres no admite escritura directa ni modificación/borrado por usuarios.

`dismiss_academy_notification` conserva contrato y semántica. El cierre de cumpleaños usa exclusivamente la nueva operación. Los clientes manuales existentes siguen leyendo, cerrando y publicando sin migrar datos.

## 7. Popup e integración con la cola

Conservar el orden relativo actual: membresía vencida primero y los avisos manuales en su orden actual; incorporar cumpleaños después de membresía vencida y antes de publicaciones manuales. El recordatorio existente de última clase continúa después de la cola. Nunca apilar diálogos.

Reutilizar `AcademyNoticeDialog` con etiqueta de acción configurable: «Gracias» para cumpleaños, «Entendido» por defecto para avisos manuales; mantener X y Escape como cierre. No añadir promociones o flujo de tutor. Conservar foco, retorno del foco, targets de 44 px y movimiento reducido. El popup no habilita cuentas, modifica membresías, reserva, paga ni descuenta clases.

La pertenencia guardada de cumpleaños se evalúa en cada respuesta fresca y no queda congelado en `openingNotices`, que actualmente fija los IDs de publicaciones manuales por apertura. Conservar esa semántica para las publicaciones manuales. Un cumpleaños aparecido al cambiar el día entra una sola vez en la cola de la sesión.

## 8. Lista y WhatsApp manual

Modificar `DesktopStudentTable` y `MobileStudentList` en `app/admin/alumnos/page.tsx`. Añadir fondo/borde discreto y texto «🎂 Cumpleaños hoy» junto al nombre. No depender solo del color; no reemplazar el estado, alerta de renovación o vencimiento. No crear filtro, contador ni orden por cumpleaños. Respetar búsqueda por nombre/DNI/teléfono, sede, estado, orden y eventual paginación.

La acción de renovación existente no puede reutilizarse íntegramente: su texto y restricciones pertenecen a renovación. Reutilizar `normalizeMembershipWhatsAppPhone` y el patrón de enlace seguro en una acción mínima de cumpleaños, separada, visible solo en filas resaltadas. No cambiar textos ni reglas del botón de renovación.

Usar únicamente `StudentListRow.phone`, que ya representa el teléfono registrado del alumno en esta lista. Si es válido según el normalizador existente, mostrar «Saludar por WhatsApp» con enlace a `https://wa.me/{phone}?text={texto codificado}`, nueva pestaña y `rel="noopener noreferrer"`. Texto prellenado propuesto: «¡Feliz cumpleaños, {full_name}! Todo el equipo de Absolute Archery te desea un gran día. ¡Muchas flechas al centro!». El administrador revisa y envía desde WhatsApp.

Si falta el teléfono o es inválido/contiene varios números: mostrar «Revisar contacto» hacia `/admin/alumnos/{id}`. No elegir un número de tutor, pagos o soporte, ni completar un país fuera de las reglas del normalizador. No cargar una nueva lista de contactos ni elegir entre contactos ambiguos. Abrir WhatsApp no registra envío ni cambia ninguna lectura o resaltado.

## 9. Refresco, caducidad, caché y fallos

Ambas superficies preparan y consultan al entrar, al recuperar visibilidad/foco y al cambiar el día según el límite del servidor. El feed puede conservar su refresco actual de avisos manuales; no añadir sondeos de cumpleaños, alumnos o contactos. La lista mantiene su carga actual, refetch al foco e invalidación tras ediciones. No imponer nuevas periodicidades a `useStudents()`.

El guardado local de nacimiento/estado invalida `studentKeys.all`, las claves de cumpleaños y `student-notifications` del alumno afectado. Cambios externos se observan en la siguiente consulta/foco; no prometer detección instantánea sin una consulta. El trigger ya ha ajustado el resultado persistido.

**Tiempo sin reloj del dispositivo:** usar calendario y duración hasta medianoche del servidor; medir tiempo transcurrido con `performance.now()` y descontar duración de petición conservadoramente. No usar reloj/zona del dispositivo para cumpleaños. Al expirar, retirar flags y cumpleaños de la cola; si el diálogo abierto es de cumpleaños, cerrarlo y continuar con el siguiente aviso sin registrar un cierre anual. No cerrar otros diálogos ni reinsertar manuales descartados. Preparar/consultar el día nuevo una vez. Si falla, dejar cumpleaños no disponible y permitir reintento por foco/conexión o manual. Tras suspensión, ocultar los datos anteriores y revalidar antes de mostrarlos.

Al cambiar cuenta/alumno: clave por cuenta y `student_id`; desmontar el diálogo anterior, cancelar solicitudes cuando sea posible y descartar resultados con generación/contexto obsoletos aunque la cancelación no sea soportada por el cliente. No usar `placeholderData` del alumno anterior. La lista usa clave por admin e IDs ordenados; flags antiguos solo se aplican si pertenecen al conjunto vigente y su calendario no expiró.

**Cierre local:** ocultar al pulsar Gracias, X o Escape, independientemente de la red. Mantener una exclusión local por cuenta/alumno/año/celebration_on en memoria durante la sesión, fuera del contador de aperturas: una respuesta lenta o un refetch de esa misma fecha no puede reinsertarlo. El ID y el cierre confirmado siguen siendo anuales; la fecha en la exclusión local permite mostrar una fecha corregida distinta cuando llegue, si el cierre anterior nunca se confirmó. No borrar esa exclusión al invalidar la caché. El intento fallido mantiene su fecha original y se descarta al verificar una fecha corregida; no silenciar la nueva fecha con un cierre local no confirmado. Al recibir un nuevo año, usar otra clave.

**Persistencia/reintento:** tras ocultar, llamar al cierre; confirmar guardado solo tras éxito. Si falla transitoriamente, conservar en memoria el intento y reintentar con backoff limitado (1 s, 5 s, 15 s), al recuperar conexión o en la próxima apertura de la misma sesión. Volver a comprobar año/fecha con el servidor antes de reintentar; nunca sustituir el payload por la fecha corregida. Errores de autorización o `BIRTHDAY_NOT_CURRENT` no se reintentan. No guardar ni exponer nacimientos en localStorage. Si se cierra la app antes de confirmar, el popup puede reaparecer; ese caso no es un cierre confirmado.

No transformar fallos de cumpleaños en errores globales de la lista o de los avisos manuales. En lista, conservar filas y filtros y mostrar un error discreto con reintento; retirar flags caducados. En el feed, mantener el comportamiento existente ante fallo total y no mostrar un cumpleaños sin respuesta válida. Nunca afirmar «sin cumpleaños» cuando no se pudo consultar.

## 10. Criterios de aceptación y pruebas

1. Alumno elegible con cumpleaños hoy ve un saludo; X, Gracias y Escape cierran sin ventanas superpuestas. Membresía vencida mantiene prioridad y avisos manuales conservan su orden.
2. Tras cierre confirmado, recargar, volver a abrir o usar otro dispositivo no lo repite ese año. Dos cierres concurrentes generan una sola fila anual.
3. Sin cierre y con corrección 28/10 → 05/11: desaparece el 28/10 y se muestra el 05/11. Con cierre el 28/10, no se repite el 05/11; ambas fechas resaltan solo cuando corresponden al nacimiento vigente.
4. Cubrir corrección hacia ayer (no atrasados), de ayer a hoy, eliminación, fecha futura, fecha inválida/no finita y recuperación de fecha válida. Repetir con/sin cierre anual y con un cierre local fallido en una sesión que sigue abierta hasta la fecha corregida. No modificar cierres de otros años.
5. En el siguiente año hay nuevo saludo; cambiar solo el año de nacimiento no permite duplicar el del año actual. Probar 31/12 → 01/01 en Lima y zonas de dispositivo opuestas.
6. Nacido el 29/02: aparece el 28/02 no bisiesto y el 29/02 bisiesto, no los días siguientes. Probar años seculares 2100/2000.
7. Ambos comportamientos excluyen `inactive` y demás estados protegidos. El popup funciona para `active`, `expired`, `paused`; no para estados protegidos ni cuenta no habilitada. No exige saldo ni membresía. Reutiliza contexto autorizado sin crear destinatarios de tutor.
8. La lista resalta todos los cumpleaños visibles, únicamente activos, vencidos y en pausa; los inactivos visibles permanecen sin etiqueta, sin depender del popup, cierres ni aperturas. No añade alumnos fuera de búsqueda/sede/estado ni cambia orden o paginación.
9. Escritorio y móvil muestran etiqueta textual, resaltado legible y contacto correcto. Teléfono inválido/ambiguo o ausente lleva a ficha; no se elige otro contacto. Abrir WhatsApp no escribe datos ni marca envío.
10. Al comenzar el día con pantalla abierta, actualizar en la consulta disparada por el límite proporcionado por servidor; al caducar calendario, retirar el estado incluso sin red. Al recuperar foco o salir de suspensión, revalidar antes de mostrar. Probar respuesta que cruza medianoche y respuestas fuera de orden.
11. Guardar nacimiento/estado invalida ambas superficies; cambios externos se detectan al volver a consultar o recuperar foco. Cambiar de alumno con peticiones pendientes no muestra ni cierra al anterior.
12. Cierre local con red fallida no reaparece por una respuesta antigua durante esa sesión. Reintentos son idempotentes; un cierre obsoleto se rechaza y no consume la celebración de la fecha corregida.
13. SQL real desechable: roles anon/student/guardian/admin, perfil deshabilitado, contexto ajeno, manipulación de ID/año/fecha, escritura directa, helpers y carreras cierre/edición. Ningún actor puede modificar permisos, fecha, cierre o cuenta ajenos.
14. Cliente antiguo + servidor nuevo y cliente nuevo + servidor anterior conservan publicaciones manuales y membresía vencida. Nunca mandar ID de cumpleaños al RPC manual.
15. Una generación diaria funciona sin sesiones; ejecuciones simultáneas y recuperación producen un único barrido completado. Ediciones ajustan solo el alumno afectado. No se crean recepciones administrativas ni mensajes externos. No cambian membresías, reservas, pagos, saldo ni contactos.

## 11. Activación y definición de completado

Primero migración aditiva, configuración revisada del trabajo diario y extensión compatible de lectores; los clientes existentes no muestran los campos nuevos. Después publicar cliente compatible, solo con autorizaciones de base real y despliegue correspondientes. No insertar cierres, cambiar nacimientos ni marcar asistencias reales para verificar.

Reversión: volver al cliente anterior y mantener tabla/operaciones aditivas; no borrar cierres ni revertir datos para evitar reenvíos al reactivar. Si fuera necesario suspender solo entrega, devolver `birthday = null` y flags vacíos mediante una corrección revisada de lectores, sin cambiar avisos actuales. Desactivar el trabajo `student-birthdays-lima` mediante su nombre al suspender la función; conservar resultados/cierres y no tocar otros trabajos. La recuperación debe suspenderse también si se necesita detener toda generación.

Completado cuando los dos comportamientos y los criterios anteriores estén verificados, con revisión visual móvil/escritorio y pruebas de permisos. Informar por separado preparado localmente, aplicado en base real y publicado. La entrega de desarrollo contiene código, migración y configuración preparados; la activación real necesita autorización posterior.

## 12. Archivos de activación preparados

- Migración funcional: `supabase/migrations/20261029040555_student_birthday_notifications.sql`.
- Activación diaria: `supabase/operations/student_birthday_cron.sql`; solo reemplaza el trabajo `student-birthdays-lima`. Requiere `pg_cron` instalado y zona UTC/GMT; se detiene si no se cumple. Horario `0 5 * * *` (00:00 Lima).
- Desactivación: `supabase/operations/student_birthday_cron_disable.sql`; no toca los cierres ni otros trabajos. Volver al cliente anterior para retirar ambos comportamientos.
- Referencia del programador: [Supabase Cron](https://supabase.com/docs/guides/cron). El daemon no estaba disponible localmente; tras autorización se verificó una ejecución nativa real en producción y se retiró el trabajo temporal de comprobación. El horario permanente permanece a medianoche de Lima. Ver registro QA.
