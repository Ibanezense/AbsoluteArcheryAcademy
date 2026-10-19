# Retención de 30 días y conversión de pruebas

Objetivo: implementar lo aprobado por el usuario: cinco series mensuales (nuevos, renovaron, pendientes, perdidos y reactivados), tasa de renovación y buscador separado de conversiones desde clases de prueba.

## Contratos

Retención: cohortes por mes del vencimiento. Continuidad de cobertura y renovación hasta 30 días exactos después del vencimiento, inclusive. Se reconoce el siguiente ciclo que amplía cobertura, incluso comprado antes y aún futuro, si comienza dentro del plazo. Un alumno por mes tiene una sola clasificación del vencimiento: se toma el último vencimiento efectivo del mes de los ciclos ya iniciados, y se clasifica renovado, pendiente o perdido. Perdido se confirma al día siguiente de terminar los 30 días. Una vuelta posterior conserva la pérdida anterior y se cuenta como reactivación en el mes de regreso. Nuevos: primera membresía, sin pruebas ni obsequios. Se ignoran ciclos contenidos/duplicados, borradores y cancelados. Se preserva aislamiento de historia inconsistente y aviso de datos parciales.

Denominador: alumnos que debían renovar (renovados+pendientes+perdidos). Tasa solo para cohortes completamente cerradas (fin de mes+30 días ya transcurrido); porcentaje ponderado por alumnos de las cohortes cerradas seleccionadas, no promedio de porcentajes. Sin denominador o cierre: dato no disponible/provisional. Los activos son otro indicador.

Pruebas: sección independiente del gráfico. Cohorte por primera clase de prueba asistida, excluyendo reservas, cancelaciones e inasistencias; una persona registrada (intro_client_id) una vez. Conversión = relación confirmada por admin con alumno cuya primera membresía no obsequio comienza desde la fecha de esa prueba hasta la fecha de referencia. El buscador por nombre y apellido filtra sin alterar denominador ni porcentaje global del periodo. No se infiere identidad automáticamente por nombre/teléfono. Un alumno solo puede estar vinculado a una persona de prueba. Se conserva autor y fecha del vínculo y de correcciones. Los recientes muestran conversión acumulada a la fecha, sin inventar un plazo de conversión.

No existe relación explícita en la base actual: se prepara tabla y RPC admin-only con RLS, validaciones, concurrencia e historial. Se requiere aplicar esa migración aditiva a la base para guardar los vínculos. Mientras falta, UI permite consultar/buscar y explica que el porcentaje no puede certificarse; no muestra 0% como resultado supuesto. No aplicar migraciones de producción sin autorización: primero preparar, probar y revisar el artefacto concreto.

## Tareas y validación

1. Actualizar algoritmo y pruebas de retención: fronteras30d, vencimiento de setiembre renovado en octubre, venta anticipada, clasificación exclusiva por alumno/mes, plazo abierto, pérdida y regreso, tasa cerrada, empate y datos inválidos.
2. Implementar cinco barras, leyenda, tarjetas/tabla y tasa ponderada con estados provisionales en MembershipGrowthChart.
3. Crear modelo, consulta completa y servicio de conversión; pruebas de cohortes de asistencia, denominadores, nombres, relaciones explícitas y fallos.
4. Preparar migración SQL aditiva y pruebas de permisos/validaciones en base desechable. Revisar antes de solicitar aplicación. No modificar datos reales para testear.
5. Implementar sección buscable y flujo de confirmación de identidad. Integrar al inicio fuera del gráfico. Actualizar indicador antiguo de conversión para no mostrar cálculo distinto bajo igual nombre.
6. Suite, lint, TypeScript, build, comprobación SQL independiente y navegador móvil/escritorio. Evidencia privada output y QA versionado. Commits enfocados; sin publicación.
