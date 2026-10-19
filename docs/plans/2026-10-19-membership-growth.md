# Evolución mensual de alumnos — plan de implementación

Objetivo: incorporar al inicio administrativo un gráfico de barras de nuevos alumnos y alumnos que no renuevan.

## Criterios confirmados por el usuario

Nuevos: inicio de la primera membresía, excluyendo pruebas y obsequios. No renovados: transcurren siete días desde el vencimiento sin continuación.

## Diseño

Dos barras agrupadas por mes, últimos doce meses, selector 6/12 meses, números enteros y tabla accesible. Visible fuera del panel mensual plegado, después de pendientes y antes de la agenda. El mes actual se muestra provisional; también el anterior hasta que termina su última ventana de siete días.

Las bajas corresponden al mes del vencimiento. La continuidad admite inicio de la siguiente membresía hasta end_date+7 inclusive. Una baja se confirma al día siguiente de ese plazo. Intervalos superpuestos o contiguos dentro del plazo forman una continuidad; se usa el vencimiento más lejano. Un alumno cuenta una vez por categoría y mes. Una vuelta posterior conserva la baja histórica y se muestra como reactivación, sin sumarla a nuevos. El balance mostrado distingue reactivaciones para no confundir nuevos menos bajas con la variación total de alumnos activos.

Se consideran membresías de origen paid, incluso becas; se excluyen gift, draft y cancelled. Se incluye historial vencido/consumido/historical y no se filtra por el estado actual del alumno. Un end_date nulo no supone vencimiento. Los datos faltantes o inválidos generan aviso, no ceros inventados. El gráfico refleja el historial registrado; no reconstruye alumnos borrados ni membresías nunca registradas.

## Tareas

1. Crear lib/utils/adminMembershipGrowth.test.ts con casos de primera inscripción, siete días inclusivos, cambio de año, solapamiento, reactivación, obsequios, borradores, fecha abierta y deduplicación. Ejecutar y comprobar fallo.
2. Implementar lib/utils/adminMembershipGrowth.ts, algoritmo puro de continuidad e indicadores mensuales. Ejecutar casos.
3. Crear servicio paginado lib/services/adminMembershipGrowthService.ts y sus pruebas. Consulta mínima de student_memberships, orden estable, sin límite de mil filas ni escrituras. Reutilizar políticas existentes.
4. Crear components/admin/MembershipGrowthChart.tsx con React Query y Recharts existente. Clave bajo students para invalidar tras cambios de membresías. Estados carga/error/vacío, filtros de periodo, leyenda y tabla.
5. Integrar app/admin/page.tsx. Ejecutar suite, lint, TypeScript y build. Verificar móvil/escritorio con lectura real, sin escrituras, y revisar cálculo con casos manuales.
6. Guardar evidencia y commit. Sin desplegar ni cambiar esquema de producción.

Ajuste por evidencia real: un ciclo tiene vencimiento anterior a inicio. El cálculo estricto lo detectó al revisar navegador. Se aísla la historia completa del alumno inconsistente y se muestra aviso de datos parciales con enlace a su ficha. Prueba añadida y datos conservados sin modificaciones.
