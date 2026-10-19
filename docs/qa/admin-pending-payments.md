# Registro de cobros pendientes

Fecha: 19 de octubre de 2026. Implementación local en `codex/admin-ux-audit`.

## Diagnóstico

Finanzas y la pestaña Pagos de la ficha mostraban estados, pero no ofrecían una operación para registrar el cobro. El seguimiento de atrasos era de lectura y no incluía pendientes sin vencimiento.

La lectura de la base confirmó cuatro registros pending de importe cero, origen admin_assignment y moneda PEN. Por eso no se puede confirmar automáticamente el monto cobrado. Se conserva cada registro y se solicita al administrador el importe real recibido.

## Solución

- Sección Pagos pendientes de membresías al principio de Finanzas y de la pestaña Pagos de cada alumno.
- Incluye pending/late, con o sin vencimiento. Lee todas las páginas y muestra bloques de 25 registros.
- Registrar cobro abre un formulario con importe, método y fecha. Los importes existentes positivos se conservan; los registros cero exigen introducir un importe recibido positivo. No se implementan pagos parciales.
- Confirmar cobro actualiza el mismo pago a paid con fecha America/Lima, método y administrador que lo registra. No crea otro pago ni altera membresías o créditos.
- Bloqueo local de doble envío y UPDATE condicional por id, alumno, importe previo y estado evitan confirmar dos veces o sobrescribir un registro ya cobrado.
- Los registros source=migration no se cobran mediante esta acción, porque los reportes los excluyen de caja. Permanecen consultables como historial en la ficha.
- Se reutiliza la política existente de la tabla: solo is_admin_user puede escribir. No se cambian permisos ni esquema.
- Se invalidan las consultas de alumnos, pendientes y dashboard y se recarga Finanzas. Un fallo al refrescar no invita a repetir un cobro ya guardado.

## Evidencia y límites

Pruebas del servicio: validación de importe, método y fecha; sesión; actualización del registro existente; protección de estado/importe/origen; fallo de escritura; cero filas; paginación de 501 registros. Suite completa: 142 archivos y 739 pruebas aprobadas. Lint, TypeScript y compilación de producción aprobados. Evidencia registrada en output, fuera de Git.

Las políticas, columnas, ausencia de triggers y origen de los pendientes se revisaron mediante lectura real. No se cambió ningún pago real para probar la interfaz. Queda pendiente verificar una confirmación completa con escritura en una base desechable; los tests del servicio usan un cliente simulado. La hora 12:00 Lima representa la fecha de cobro seleccionada, no una hora declarada de transacción.

No se ha desplegado esta corrección ni se han aplicado migraciones.

Revisión de navegador: Finanzas muestra los cuatro pendientes reales; abrir Registrar cobro pide importe y método sin rellenarlos automáticamente. Sin desbordamiento a 360 × 800 y 1440 × 1000. Escape cierra el formulario y devuelve el foco al botón Registrar cobro. Se abrió y canceló sin confirmar el cobro.

La ficha de Luciana mostró un único pendiente al abrir Pagos, coherente con su historial. Finanzas muestra cuatro. El formulario se dejó abierto y vacío en la vista local para revisión; no se pulsó Confirmar cobro.
