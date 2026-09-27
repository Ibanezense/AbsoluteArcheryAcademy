# Tarjeta de renovación de membresía

## Objetivo

Hacer que la fecha de vencimiento de la membresía se entienda como la fecha en la que el alumno debe renovar y advertir visualmente cuando se aproxima o ya pasó.

## Diseño aprobado

- La tarjeta del inicio del alumno cambia la etiqueta `Vence` por `Renovación`.
- La fecha continúa usando `membership_end`, el mismo vencimiento registrado en el perfil del alumno.
- Si faltan más de siete días, conserva el estilo verde.
- Si faltan entre cero y siete días, incluyendo el propio día de vencimiento, el contenido de la tarjeta se muestra en anaranjado.
- Desde el día siguiente al vencimiento, el contenido se muestra en rojo.
- Si no existe una fecha, muestra `Sin fecha` con un estilo neutro.

## Implementación

La clasificación de la fecha se resolverá en una utilidad pura y comprobable usando la fecha de Lima como referencia. `QuickMetric` admitirá los tonos necesarios sin alterar las demás tarjetas del inicio.

## Verificación

- Pruebas unitarias para más de siete días, exactamente siete días, el día de vencimiento, fecha vencida y fecha ausente.
- Prueba de la superficie del inicio para comprobar la etiqueta `Renovación` y el uso de la fecha de membresía.
- Ejecución completa de pruebas, lint y compilación de producción.
