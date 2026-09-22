# Disponibilidad semanal de clases de prueba

## Objetivo

Ampliar la tarjeta superior del inicio administrativo para mostrar la disponibilidad de clases de prueba de la semana actual desde el miércoles hasta el domingo.

## Alcance aprobado

- Miércoles, jueves y viernes muestran únicamente los turnos habilitados para pruebas de Umacollo.
- Sábado y domingo muestran únicamente los turnos habilitados para pruebas de Tiabaya.
- La semana operativa se calcula en la zona horaria `America/Lima` y cambia cada lunes.
- Cada día muestra fecha, sede, horario, cupos disponibles y ocupación de arcos.
- Los turnos llenos permanecen visibles.
- La cantidad de turnos proviene de las sesiones recurrentes activas configuradas; no queda limitada a una cantidad fija de tarjetas.

## Diseño técnico

La consulta administrativa de capacidad dejará de limitarse al fin de semana. Consultará desde el miércoles hasta el domingo de la semana actual, incluirá la sede de cada sesión y filtrará la combinación esperada de día y sede. La interfaz agrupará las filas por los cinco días operativos y renderizará solamente las sesiones existentes, mostrando un estado sin horarios cuando un día no tenga sesiones programadas.

Se conservará el nombre de la función RPC y la clave de caché por compatibilidad con las invalidaciones existentes. El cambio será aditivo en la forma de los resultados: se incorporarán `location_id`, `location_code` y `location_name`.

## Validación

- Pruebas unitarias para fechas de miércoles a domingo en horario de Lima.
- Pruebas del servicio para la nueva información de sede.
- Pruebas de contrato SQL para el rango semanal y el filtro por sede.
- Pruebas de la tarjeta administrativa para los cinco grupos y su diseño adaptable.
- Lint, suite completa y compilación de producción.
