# Controles: consumidor privado de la PWA

La entrega actual conecta solo Controles. `tournament_engine` es un valor reservado para una entrega posterior y ninguna ruta permite confirmarlo.

## Configuración de servidor

- `STUDENT_PROGRESS_ENABLED=true` habilita la lectura del alumno. Su ausencia o cualquier otro valor devuelve 404 privado sin acceder a la fuente.
- `ACADEMY_CONTROLS_URL` indica el origen de la web de controles, por ejemplo `https://controles.example`. La ruta privada se fija en `/api/integrations/student-controls`.
- `ACADEMY_CONTROLS_READ_TOKEN` debe coincidir con `ACADEMY_PROGRESS_READ_TOKEN` en el origen, tener al menos 32 caracteres y ser exclusivo de esta integración.
- HTTP solo se admite para localhost durante `NODE_ENV=development`. Producción exige HTTPS. No se siguen redirecciones.
- Supabase usa la URL y la clave anon existentes, junto con el JWT del solicitante. No se usa `service_role`.

Nunca colocar los secretos de integración en variables `NEXT_PUBLIC_*`, URLs, errores, capturas ni repositorios.

## Acceso y consistencia

La ruta del alumno valida el JWT con `auth.getUser`. La consulta `student_progress_context` vuelve a comprobar el perfil activo, resuelve el alumno autorizado con `resolve_accessible_student_id` y lee su distancia y vínculo confirmado. Esto ocurre antes de caché y origen y nuevamente después de cada lectura, incluso si falla la fuente. Cambios de tutor, revocación o revisión durante la consulta impiden entregar un historial antiguo.

La caché de proceso guarda solo snapshots completos y validados durante cinco minutos, por ID de vínculo, identidad externa, revisión y versión contractual. La distancia asignada siempre procede de la lectura actual de Supabase. Una entrada vencida se elimina; tras fallar su revalidación solo se conserva la fecha de la última comprobación conocida, sin puntajes. El límite es de 100 entradas. Reiniciar el proceso pierde esta caché. Una confirmación o revocación vacía ambas cachés del proceso; otros procesos quedan protegidos por la revalidación del contexto.

No se aceptan snapshots incompletos, IDs duplicados, campos faltantes, fechas imposibles, horas futuras de Lima, puntajes fuera de formato ni controles de otra identidad. Los errores devuelven códigos seguros. Todas las respuestas usan `Cache-Control: private, no-store` y `Vary: Authorization`.

La búsqueda y vista previa requieren administrador activo antes de consultar la fuente y vuelven a validar ese permiso antes de entregar su respuesta. Confirmar obtiene de nuevo el registro completo de origen; el nombre suministrado por un cliente no es una evidencia de identidad. La RPC exige evidencia humana, versión esperada, exclusividad de identidad y una escritura auditada atómica. La confirmación no modifica el origen.

## Validación local

- `npx vitest run lib/server/studentProgress`
- `node tests/supabase/runStudentProgress.mjs`

El segundo comando requiere PGlite instalado en `output/postgres-test/node_modules/@electric-sql/pglite` y construye una base efímera aislada. Sus fixtures nunca deben ejecutarse en la academia. Comprueba alumno, tutor, otro alumno, anónimo y administrador inactivo; unicidad y revisión esperada; escrituras directas bloqueadas; auditoría y reversión ante fallo del registro de auditoría. Además, se ejecutó la prueba nativa en PostgreSQL 17.6 para Windows: tres carreras con espera de bloqueo observada y 20 comprobaciones aprobadas. Se verificaron identidad externa compartida, dos reemplazos con la misma revisión y reemplazo frente a revocación. En cada carrera hubo un éxito y un conflicto; el vínculo confirmado fue único y la auditoría coincidió con las transiciones confirmadas. El coordinador repitió la prueba con el mismo resultado.

La migración se aplicó tras autorización expresa con la versión generada por Supabase `20261020033416`, a la que se alineó el nombre del archivo local sin alterar su SQL. El piloto local quedó configurado mediante una credencial exclusiva en archivos ignorados; `STUDENT_PROGRESS_ENABLED=true` se limita a `.env.development.local` del worktree. El usuario confirmó una identidad real y se verificó su lectura completa. No se publicaron proyectos ni se cambiaron variables de Vercel. Ver [piloto local](../qa/2026-10-19-student-progress-local-pilot.md).


## Reproducir concurrencia en PostgreSQL aislado

La ejecución del 19 de octubre de 2026 utilizó los binarios `@embedded-postgres/windows-x64@17.6.0-beta.15`, procedentes de `leinelissen/embedded-postgres` y basados en las distribuciones de Zonky. Se instalaron únicamente dentro de `output/postgres-native`, con scripts npm deshabilitados. No se instaló un servicio de Windows ni se modificó Docker.

Ejecutar desde la raíz del worktree. Los archivos, el cluster y las credenciales siguientes son exclusivamente sintéticos. No usar una URL de Supabase ni una base de la academia.

Preparación inicial, una sola vez:

```powershell
npm install --prefix output/postgres-native --no-audit --no-fund --ignore-scripts --save-exact @embedded-postgres/windows-x64@17.6.0-beta.15
Set-Content -LiteralPath output/postgres-native/test-password.txt -Value 'codex-local-test-only' -Encoding ascii
& './output/postgres-native/node_modules/@embedded-postgres/windows-x64/native/bin/initdb.exe' -D './output/postgres-native/cluster' -U codex_progress_test --pwfile='./output/postgres-native/test-password.txt' --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 --locale=C
Remove-Item -LiteralPath output/postgres-native/test-password.txt
```

Iniciar el proceso oculto y exclusivamente en loopback:

```powershell
$progressNativeExe=(Resolve-Path './output/postgres-native/node_modules/@embedded-postgres/windows-x64/native/bin/postgres.exe').Path
$progressCluster=Join-Path (Get-Location) 'output/postgres-native/cluster'
$progressNativeProcess=Start-Process -FilePath $progressNativeExe -ArgumentList @('-D',('"'+$progressCluster+'"'),'-h','127.0.0.1','-p','55439') -WindowStyle Hidden -PassThru -RedirectStandardOutput './output/postgres-native/postgres.stdout.log' -RedirectStandardError './output/postgres-native/postgres.stderr.log'
```

Crear o reiniciar **solo la base sintética marcada** y ejecutar las carreras:

```powershell
node tests/supabase/prepareStudentProgressConcurrency.mjs --reset-test-database
node tests/supabase/runStudentProgressConcurrency.mjs 'postgres://codex_progress_test:codex-local-test-only@127.0.0.1:55439/codex_student_progress_test'
npx vitest run tests/supabase/studentProgressConcurrency.test.ts
```

El preparador valida que `SHOW data_directory` coincida exactamente con el cluster de este worktree en `output/postgres-native/cluster`, así como el usuario ficticio, antes de eliminar y recrear únicamente `codex_student_progress_test`. Exige el argumento explícito de reinicio. El runner rechaza hosts remotos, otros puertos, nombres, usuarios, contraseñas y parámetros de conexión. Nueve pruebas de estas restricciones están conservadas en el repositorio. El runner también rechaza una base que ya tenga las tablas inicializadas.

Resultado esperado:

```text
Student progress PostgreSQL concurrency: 3 lock races and 20 assertions passed.
```

Apagar únicamente el cluster de prueba al terminar:

```powershell
& './output/postgres-native/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe' -D './output/postgres-native/cluster' -m fast -w stop
```

Las carreras usan dos conexiones transaccionales y una tercera observadora. Antes de liberar la ganadora, se comprueba `pg_stat_activity.wait_event_type = 'Lock'` para demostrar que la segunda realmente espera. Las sesiones usan el rol `authenticated` y el actor administrador del fixture. Ninguna conexión apunta al sistema real.
