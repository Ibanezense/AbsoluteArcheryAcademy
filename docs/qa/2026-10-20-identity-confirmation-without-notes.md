# Confirmación de identidad sin texto obligatorio

Se retiró el campo de justificación de Controles y Competencias. La vista previa, la casilla de verificación y el diálogo de confirmación se mantienen. La API normal del administrador genera la constancia de esa decisión; las funciones existentes registran actor, fecha y registros vinculados. Las notas históricas y los clientes anteriores con evidencia válida conservan compatibilidad. Un indicador de verificación falso o mal formado se rechaza.

El error de la operación pendiente era independiente del formulario: TE devolvía `LibsqlError BLOCKED` al escribir con la conexión de lectura. La comprobación de permisos con una actualización de cero filas reprodujo el rechazo del lector y comprobó el escritor existente sin cambiar datos. El endpoint de identidad utiliza ahora una credencial privada dedicada; la conexión de los consumidores deportivos no cambió. Sin esa credencial el endpoint falla cerrado, sin recurrir a la del lector.

Verificación:

- PWA: 997 pruebas en 184 archivos aprobadas, ESLint, tipos y compilación de producción aprobados.
- TE aislado: 57 pruebas aprobadas; pruebas dirigidas de permisos y cliente de identidad, ESLint y revisión independiente sin hallazgos materiales pendientes.
- Casos nuevos observados rojos antes de implementar; verdes después. API de ambos orígenes acepta la decisión explícita sin texto, genera la nota desde el servidor y rechaza decisión falsa antes de llamar al RPC de escritura.
- Conexión TE comprobada antes de promoción. Reintento ejecutado desde la sesión administrativa normal sobre la decisión que el usuario ya había confirmado: vínculo `confirmed`, misma revisión y operación original `completed`, sin error pendiente. Auditoría TE: una confirmación de generación 1 para esa operación.
- No se creó una nueva decisión, no se modificaron resultados deportivos ni pagos y no se aplicaron migraciones.

Entrega TE aislada sobre la última versión publicada; no incluye cambios ajenos del checkout original. Credenciales y evidencia con datos reales permanecen fuera de Git en los directorios privados de trabajo.
