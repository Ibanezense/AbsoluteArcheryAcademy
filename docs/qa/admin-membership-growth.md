# Validación de evolución mensual

Fecha de referencia: 19 de octubre de 2026, America/Lima. Implementación local en codex/admin-ux-audit.

Criterios elegidos por el usuario: nuevos por inicio de primera membresía sin pruebas ni obsequios; no renovados tras siete días desde vencimiento.

El gráfico usa dos barras agrupadas, selector de 6/12 meses y tabla accesible. Reactivados se informa aparte para no clasificarlos como nuevos. Las bajas se atribuyen al mes del vencimiento; los siete días son inclusivos para renovar, y una baja se confirma al día siguiente del plazo. El mes actual y el anterior durante sus últimos plazos se consideran provisionales. Se lee todo el historial, sin filtrarlo por estado actual del alumno. La ventana visible no limita la búsqueda de la primera inscripción.

Continuidades: se fusionan membresías solapadas y separadas por un plazo de hasta siete días. Se usa el vencimiento más lejano; fecha final nula no acredita baja. Cada alumno se cuenta una vez por categoría y mes. Borradores, canceladas y obsequios quedan excluidos. Las membresías paid de becas sí cuentan. Un regreso posterior al plazo conserva la baja anterior y registra reactivación, nunca una segunda alta nueva. No se presenta un supuesto balance de alumnos activos a partir de eventos mensuales.

Se conserva el cálculo antiguo por fecha de creación con la etiqueta Fichas creadas, para distinguirlo del criterio de primera membresía del gráfico.

No hay nueva migración, permisos ni escrituras. Se reutilizan la tabla y políticas existentes. Consulta paginada en bloques de 500, orden estable por id. Un fallo de cualquier página descarta el resultado completo; Una inconsistencia de fechas excluye el historial completo del alumno afectado y aparece como datos parciales con enlace a su ficha; no se altera la base ni se infiere la fecha correcta. Meses anteriores al primer registro conocido aparecen sin historial. La información refleja el historial registrado y no reconstruye registros eliminados o nunca cargados.

## Casos de prueba

- Primera membresía y renovación posterior.
- Vencimiento 31 de enero: aún en plazo el 7 de febrero, baja de enero confirmada el 8.
- Renovación con inicio 7 de febrero mantiene continuidad; inicio 8 de febrero produce reactivación y conserva baja de enero.
- Solapamientos, ciclos con vencimiento menor, final abierto y ciclos futuros.
- Una persona con dos bajas en el mismo mes cuenta una vez.
- Histórico incluido; pruebas, obsequios, borradores y canceladas excluidos.
- Cambio de año, meses sin eventos y fechas inválidas.
- Consulta con 1001 registros y fallo de segunda página.

## Contraste independiente

Una consulta SQL de lectura, con ventanas por alumno e intervalos de continuidad, permitió comparar las mismas definiciones sin usar el algoritmo del navegador. Se excluye el mismo alumno con fechas inconsistentes para que el universo coincida. Para el corte 19/10/2026: marzo 26 nuevos / 0 no renovados / 1 reactivado; julio 4 / 9 / 3; septiembre 0 / 9 / 4; octubre provisional 4 / 3 / 1. Verificar estos valores en la tabla del navegador. Las cifras pueden cambiar con actividad o correcciones históricas posteriores.

## Verificación final

Suite completa: 144 archivos, 753 pruebas aprobadas. ESLint, TypeScript y compilación de producción aprobados. Revisión independiente del cálculo, caché y manejo de inconsistencias completada. No se ha publicado el cambio.

## Inconsistencia encontrada

Se detectó un ciclo cuyo inicio es 01/08/2026 y fin 07/07/2026. El gráfico excluye un alumno completo de las cifras y muestra la advertencia; sumar solo sus otros ciclos podría inventar la primera inscripción o una baja. Una prueba reproduce ese caso. Corregir el dato requiere revisar el historial con el administrador; no se modificó en esta entrega.

## Navegador y conciliación

La tabla del navegador coincide con la consulta SQL independiente: marzo 26/0/1, julio 4/9/3, septiembre 0/9/4 y octubre 4/3/1, con tres alumnos todavía en plazo en octubre. Totales 12 meses: 58 nuevos, 45 eventos de no renovación y 22 reactivaciones; últimos 6 meses: 27/41/20. Son cifras parciales por la exclusión señalada y acumuladas por mes. No son un saldo de alumnos activos.

Revisión local a 360 × 800: documento y contenido de 345 px, sin desbordamiento horizontal. A 1440 × 1000: 1425/1425 px. Selector 6/12 meses y tabla accesible comprobados. Capturas privadas output/admin-ux-after/11-evolucion-desktop.png y 12-evolucion-mobile.png; no incluidas en Git.

## Ampliación a tres barras

A petición del usuario, las series son Nuevos (verde), Renovaron (azul) y No renovaron (rojo). Las tarjetas, leyenda, descripción accesible y tabla reflejan las tres cifras. Reactivados se conserva en tabla y ayuda como categoría auxiliar.

Renovaron cuenta alumnos con un ciclo posterior que extiende cobertura dentro de la continuidad de siete días, por mes del inicio de ese ciclo, no por fecha de pago anticipado. Un alumno cuenta una vez por mes. Se ignoran duplicados y ciclos contenidos. Al coincidir el inicio se procesa primero la cobertura más larga, incluida fecha final abierta; los identificadores no pueden cambiar la cifra. Se añadieron pruebas de múltiples renovaciones del mismo mes, día siete, reactivación tardía, ciclo futuro, duplicado, obsequio y empates de fecha con identificadores intercambiados.

Validación de tres series: suite completa 144 archivos/759 pruebas, TypeScript y compilación aprobados. Navegador y SQL independiente coinciden en renovaciones: marzo6, abril11, mayo1, junio10, julio17, agosto23, septiembre21 y octubre14. Últimos12meses suman103 renovaciones mensuales y últimos6meses86; no se interpreta como alumnos únicos del periodo. Se comprobaron tres series SVG y ancho documento/contenido345/345px a360×800. Evidencia privada: output/admin-ux-after/13-evolucion-tres-series-desktop.png. Sin publicación ni modificaciones de datos.
