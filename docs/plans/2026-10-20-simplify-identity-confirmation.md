# Simplificar confirmación de identidad y completar operaciones pendientes

Solicitud: eliminar la redacción obligatoria descrita en la propuesta anterior y corregir el error real de vinculación. Conservar selección explícita del registro, casilla de verificación humana y diálogo final. Registrar automáticamente administrador, fecha y registros; preservar evidencias históricas y operaciones ya confirmadas.

1. Pruebas rojas/verdes: confirmar sin texto mediante `identityVerified: true`, rechazar ausencia/falso, conservar clientes anteriores con evidencia válida y no permitir sobreescribir la constancia automática.
2. Quitar campo y estado de texto en `StudentProgressLinks` y `EngineProgressLinks`; generar constancia desde las API privadas, manteniendo RPC, permisos y confirmación humana existentes. No migraciones.
3. Diagnosticar rechazo de escritura TE. Configurar credencial de integración separada para el endpoint de identidad, sin modificar la conexión de lectura de sus consumidores. Probar configuración cerrada sin credencial y URL remota válida; conservar autenticación por token de identidad.
4. Verificar suites, tipos/lint, compilación y revisión. Publicar TE desde la entrega aislada y PWA desde main. Reintentar únicamente la operación pendiente que el administrador ya confirmó para el alumno de la captura, usando el flujo normal; no crear otra decisión ni vincular por similitud de nombre.
5. Comprobar resultado, auditoría e interfaz en navegador sin introducir datos deportivos o pagos.
