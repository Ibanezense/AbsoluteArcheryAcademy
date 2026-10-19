# Ingresos por mes de venta

Validación 19/10/2026, America/Lima, rama `codex/admin-ux-audit`.

## Causa y corrección

El registro de cobro actualizaba correctamente paid_at, pero los reportes usaban esa misma fecha para atribuir ingresos al periodo. Cuatro regularizaciones por S/680 aparecían en octubre aunque sus ventas eran de agosto (S/480) y setiembre (S/200).

Se añaden tres RPC de lectura sin editar pagos. Para membresías, sale_at usa membership_purchases.purchased_at, con fallback a creación original del pago y de la membresía para legado. Los límites del periodo se convierten explícitamente desde medianoche en Lima. Inicio/vencimiento de ciclo no sustituye la venta. paid_at permanece separado. Pruebas de introducción conservan el criterio anterior de pago confirmado y su fecha; la interfaz lo aclara.

El reporte paginado, KPI filtrado, resumen financiero y Facturación del inicio usan el nuevo criterio. Pendientes y proyección financieros pertenecen a la misma cohorte de venta; deuda vencida y otros indicadores se conservan. El inicio mantiene alcance de membresías y excluye pruebas. Tabla, móvil, detalle y CSV distinguen fecha atribuida y fecha de cobro. Al registrar un pendiente se informa la fecha de venta que conservará.

Los RPC anteriores por fecha de cobro no se modifican ni eliminan. La nueva interfaz no presenta un flujo de caja.

## Conciliación real

| Periodo 2026 | Antes por cobro | Ahora por venta |
| --- | ---: | ---: |
| Agosto | S/7.534 | S/8.014 |
| Setiembre | S/3.781 | S/3.981 |
| Octubre | S/4.620 | S/3.940 |

Consulta independiente de lectura, nuevos RPC y navegador coinciden en esos totales. El inicio muestra S/3.520 para ventas de membresías pagadas de octubre; Finanzas agrega S/420 de pruebas pagadas, total S/3.940. Los cuatro pagos conservan estado paid y su paid_at original de la regularización, sin escrituras en registros de negocio durante la corrección.

Se verificó en navegador que una venta del 26/08 aparece en agosto y su detalle conserva el cobro registrado el 19/10. Filtros de agosto, setiembre y octubre concuerdan con la consulta agregada. La información cambia con nueva actividad o ajustes históricos.

## Pruebas y permisos

- Regresión observada primero: el servicio todavía invocaba get_finances_report y aceptaba fecha de venta ausente; luego las pruebas pasan con el RPC por venta y validación explícita.
- Integración SQL falla primero por función inexistente; después pasa la migración real en PostgreSQL desechable mediante PGlite. Cubre venta agosto/cobro octubre, frontera mensual Lima, venta anticipada respecto al inicio, fallback legado, paid/pending, exclusión de migración y pruebas no pagadas, preservación de fechas, pendientes y proyección, roles y permisos. El inicio incluye venta pagada actual y excluye regularizaciones históricas, pruebas, pendientes e importaciones.
- Fixtures mínimas en financeSalesPeriod.bootstrap.sql después de adminTrialConversion.bootstrap.sql. Los RPC anteriores se sustituyen por respuestas controladas exclusivamente en esa base desechable. Compatibilidad con funciones reales confirmada después mediante consulta de los tres RPC en Supabase y navegador autenticado. Nunca ejecutar esos bootstrap sobre la base real.
- Suite completa: 149 archivos y 789 pruebas aprobadas. Preservada cobertura previa de todas las páginas, orden estable y fallo en página posterior sin resultado parcial. TypeScript, ESLint y build de producción aprobados.
- Revisión independiente completada sin observaciones pendientes. La recomendación de probar revenueThisMonth explícitamente se incorporó y verificó.
- Migración aplicada con autorización expresa del usuario: 20261019150237_finance_sales_period_attribution.sql, identificador alineado con Supabase. Nuevas funciones exigen auth.uid y is_admin_user; búsqueda de esquema fija, sin ejecución anónima. Las fixtures prueban denegación para alumnos y usuarios sin sesión.
- Advisors revisados: advertencias genéricas de ejecución autenticada de SECURITY DEFINER en las tres RPC, intencionales para estas consultas administrativas y mitigadas por autorización explícita probada; ninguna ejecución anónima concedida. Hallazgos sobre otros objetos existentes fuera de este cambio no se modificaron.

Navegador local compilado: comprobación escritorio/móvil, sin desbordamiento a 390 px (documento 375 px). Capturas privadas output/admin-ux-after/finance-sales-october-desktop.png y finance-sales-summary.png, excluidas de Git. La base tiene las funciones activas; interfaz local sin despliegue público.
