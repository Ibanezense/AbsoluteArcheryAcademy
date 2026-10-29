# QA: cumpleaños del alumno

Fecha: 28/10/2026, America/Lima. Entorno: desarrollo local, rama `codex/admin-ux-audit`, base de trabajo `d6f10b5`. No se aplicaron migraciones ni tareas a producción y no se publicó la app.

## Implementación revisada

- Popup del alumno integrado en cola existente, Gracias/X/Escape, cierre anual y supresión local por fecha cuando un cierre no pudo confirmarse.
- Etiqueta y resaltado en lista de escritorio/móvil. Incluye solo `active`, `expired`, `paused`; inactivos y demás estados protegidos quedan sin cumpleaños en ambas superficies.
- Resultado diario persistido independiente de cierre, preparación autorizada del día ausente y actualización puntual por ficha. Lectores STABLE, sin barridos en lecturas.
- Cron preparado a las 00:00 Lima, sin ejecución/activación real en producción.
- Contacto manual solo con teléfono registrado válido; si falta o es ambiguo, enlace a ficha. No se abrió ni envió ninguna conversación real.

## Evidencia automatizada

Resultados finales: **201 archivos y 1.099 pruebas aprobadas**; lint sin errores/advertencias; compilación Next.js completada con salida 0. La prueba de concurrencia PostgreSQL también terminó con salida 0. Los comandos se ejecutaron desde el worktree, no desde producción. Advertencias informativas preexistentes: API CJS de Vite y base caniuse-lite antigua; no se actualizaron dependencias ajenas al alcance.

| Comprobación | Evidencia local |
| --- | --- |
| Suite completa de Vitest | `output/birthday-final-suite.log` |
| Lint completo | `output/birthday-final-lint.log` |
| Compilación de Next.js | `output/birthday-final-build.log` |
| PostgreSQL real, conexiones independientes | `output/birthday-final-concurrency.log` |
| Regresión roja de respuesta anterior al foco | `output/birthday-return-red.log` |
| Regresión y corrección final de visibilidad | `output/birthday-review-green.log` |

Base desechable: PostgreSQL 17.6 en `127.0.0.1:55441`, base `birthday_concurrency`, aislada de la academia. El runner solo acepta servidores locales y nombres `birthday_*`; no utiliza credenciales reales. Pruebas de SQL/roles también en PGlite, ejecutando `SET ROLE` y no solamente comprobando texto de migración.

```powershell
npm test -- --reporter=dot
npm run lint
node output/run-admin-progress-review.cjs build
$env:BIRTHDAY_TEST_DATABASE_URL='postgresql://codex@127.0.0.1:55441/birthday_concurrency'
node tests/database/runBirthdayConcurrency.mjs
```

El lanzador de compilación ya existía en `output/`; carga configuración local privada sin publicarla. Los logs no se incorporan al repositorio por contener salidas de desarrollo.

### Casos SQL y concurrencia comprobados

- Generación con `auth.uid()` ausente, sin alumno ni administrador con app abierta; identidad técnica interna, no un usuario ficticio como autor.
- Generadores simultáneos se bloquean sobre la clave de procesamiento y producen una sola marca completada. Un día completado no se vuelve a recorrer, incluso al repetir recuperación.
- Fallo inyectado durante generación: rollback de resultado incompleto y recuperación posterior correcta.
- Ajuste por nacimiento/estado solo modifica la pertenencia del alumno editado. No toca otros alumnos.
- Cierres concurrentes dejan una fila anual. Edición que gana primero rechaza el cierre obsoleto; cierre que gana primero sobrevive a correcciones posteriores.
- Corrección futura/pasada, nacimiento ausente/no finito/futuro, años bisiestos 2000/2100, invariancia al cambiar zona de sesión a Pacific/Kiritimati y elegibilidad activa/vencida/pausa.
- Cierre y resaltado independientes; rol anónimo, cuenta deshabilitada, contexto ajeno, escritura directa y helpers internos rechazados.
- Regresión de actualización de varios alumnos frente a edición individual: bloqueos compartidos permiten coexistencia sin ciclo. Ambos órdenes entre barrido diario y edición conservan resultado correcto.

### Revisión y correcciones

Se hicieron revisión independiente de cumplimiento y revisión de calidad/seguridad. Se corrigieron dos hallazgos antes de la entrega:

1. El ajuste puntual usaba bloqueo exclusivo global e introducía riesgo de deadlock con actualizaciones de varios alumnos. Ahora usa bloqueo compartido; el generador conserva exclusivo. La regresión se ejecutó con PostgreSQL y conexiones independientes.
2. Una respuesta iniciada antes de ocultar/volver a la ventana podía parecer fresca por su hora de recepción. Ahora se valida el inicio de petición y se invalida tanto al ocultar como al regresar visible. La prueba reprodujo el fallo antes del cambio.

La última revisión no dejó hallazgos importantes pendientes en el código revisado.

## Revisión visual y recorrido local

Se ejecutó un banco de pruebas temporal en `http://127.0.0.1:3188`, dentro de `output/birthday-qa`, sin añadirse a las rutas publicables. Usa los componentes reales de la lista, centro y diálogo, y RPC sobre otra base local desechable `birthday_visual`. Solo el origen de sesión/lista base se sustituyó por fixtures sintéticos. No equivale a una prueba de inicio de sesión real en Supabase ni a QA de una publicación en Vercel.

| Caso | Resultado observado |
| --- | --- |
| Popup en móvil 390×844 y escritorio 1440×1000 | Legible, sin desbordamiento, botón Gracias y X visibles. |
| Gracias y Escape | Cierran; el cierre se guardó en PostgreSQL local. X mantiene el cierre existente cubierto por pruebas montadas. |
| Otra apertura tras cerrar | Sin felicitación repetida con el cierre confirmado. |
| Lista de escritorio y móvil | Activo y en pausa resaltados; alumno inactivo del fixture sin etiqueta. |
| Cierre del alumno frente a lista | El resaltado se mantiene; no depende del cierre. |
| Filtro Inactivos y búsqueda «Inactivo» | Solo la fila correspondiente, sin cumpleaños, sin cambiar el orden. |
| Teléfono válido del fixture | Enlace WhatsApp codificado, inspeccionado sin abrir ni enviar mensaje. |
| Alumno sin teléfono | Acción Revisar contacto dirigida a su ficha. |

Capturas, generadas a partir de datos sintéticos:

- [Popup móvil](../../output/birthday-qa/screenshots/student-mobile.png).
- [Popup escritorio](../../output/birthday-qa/screenshots/student-desktop.png).
- [Lista escritorio](../../output/birthday-qa/screenshots/admin-desktop.png).
- [Lista móvil](../../output/birthday-qa/screenshots/admin-mobile.png).

Caducidad de medianoche, paso a otro aviso, cambios de contexto y respuestas tardías se comprobaron en pruebas montadas con temporizadores controlados, no esperando una medianoche real ni cambiando el reloj/datos de producción.

## Limitaciones explícitas

- El PostgreSQL local no incluye `pg_cron`. Se probó el rechazo explícito de la configuración cuando falta la extensión y se revisó horario/zona/nombre del trabajo. **No se verificó la ejecución del daemon real a medianoche**. El generador sin sesiones, recuperación y concurrencia sí se ejecutaron. Este punto debe validarse en un entorno con la extensión y durante la activación autorizada; no se declara aprobado.
- No se ejecutó la migración sobre una copia completa de producción ni se probaron sesiones reales de alumnos en Supabase local. El aislamiento/contratos SQL se probaron sobre esquema de fixtures y roles reales; la revisión visual usó una sesión sintética.
- No hubo envíos por WhatsApp, pruebas con alumnos reales, cambios de membresía ni despliegue.

## Cambios concretos pendientes de autorización

1. Aplicar `supabase/migrations/20261028120000_student_birthday_notifications.sql`: tres tablas, restricciones/RLS, lectores compatibles, preparación/generación/cierre y trigger puntual. Sin backfill histórico ni modificaciones a pagos/reservas/saldo.
2. Revisar disponibilidad y zona de pg_cron, aplicar `supabase/operations/student_birthday_cron.sql`: trabajo único `student-birthdays-lima`, `0 5 * * *` en UTC, 00:00 America/Lima. El script solo sustituye trabajos con ese nombre.
3. Integrar y publicar únicamente estos cambios de aplicación desde main. Los clientes anteriores continúan funcionando con la migración aditiva; los nuevos manejan un esquema aún no activado sin romper avisos manuales.
4. Verificar después de activar el resultado del día, permisos, alias/versión y ejecución programada real. No fabricar cierres o nacimientos para alumnos de producción.

Reversión: volver al cliente anterior; ejecutar `supabase/operations/student_birthday_cron_disable.sql` solo para detener este trabajo. Conservar los cierres anuales. Si también se necesita suspender toda recuperación, deshabilitar su RPC/entrega mediante corrección revisada, sin tocar otros jobs, membresías o avisos manuales. No borrar datos para revertir.
