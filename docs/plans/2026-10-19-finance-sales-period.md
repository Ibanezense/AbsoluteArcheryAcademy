# Atribución de ingresos al mes de venta

Corrección solicitada: regularizar pagos de ventas pasadas no debe incrementar el ingreso por ventas del mes actual. Se conserva fecha de cobro y estado pagado sin reescribir movimientos.

Fuente para membresías: `membership_purchases.purchased_at`, con fallback a `student_membership_payments.created_at` y fecha de creación de membresía para legado. Nunca usar inicio/vencimiento de ciclo como venta ni sustituir paid_at. Día/mes America/Lima. Pruebas de introducción conservan el criterio de fecha de pago ya existente; UI explica la distinción.

1. Crear prueba SQL aislada de venta agosto/cobro octubre y otros límites; confirmar fallo antes de implementar.
2. Añadir RPC admin-only de reporte por venta, manteniendo RPC de caja anteriores compatibles; devolver fechas de venta y cobro separadas y tipo de movimiento explícito.
3. Añadir wrappers admin-only para resumen financiero y resumen del inicio. Los pagos confirmados se atribuyen a venta; pendientes y proyección del periodo usan la misma cohorte. Conservar deuda vencida y otras métricas.
4. Conectar servicio paginado, fechas en tabla/móvil/detalle/CSV, explicación en formulario de cobro. Pruebas de paginación y error; no fallback a fecha incorrecta ni ceros supuestos.
5. Comparar sin escribir registros: cuatro pagos ya regularizados, S/480 agosto y S/200 setiembre. Revisar SQL/permisos, suite, build y UI. Pedir aplicación de funciones tras pruebas y revisión. Sin publicación de interfaz ni edición de pagos reales.
