# Control semanal de asistencia por frecuencia de membresía

## Problema

La revisión dominical actual solo incluye alumnos sin ninguna asistencia y permite registrar una sola inasistencia por semana. Esto deja fuera a quienes tienen una membresía de dos, tres o cuatro clases semanales y cumplen solo parte de su frecuencia.

## Regla aprobada

Cada plan tendrá una frecuencia explícita de `0` a `4` clases por semana. Al asignar el plan, la frecuencia se copiará a la membresía para conservar la regla contratada aunque el plan cambie después.

La migración clasificará automáticamente los planes actuales:

- planes de una clase semanal, afiliados y Media Beca: `1`;
- planes de dos clases semanales: `2`;
- planes de tres clases semanales: `3`;
- planes de cuatro clases semanales: `4`;
- Obsequio, Clase de Introducción, Paquete clases sueltas, Paquete 8 clases y planes sin frecuencia definida: `0`.

Todas las membresías existentes heredarán el valor de su plan. Administración podrá editar la frecuencia en el formulario del plan, sin configurar alumnos individualmente.

## Cálculo dominical

Se conserva la ventana actual de jueves a domingo y el bloqueo de la revisión mientras existan reservas pendientes de asistencia.

Para cada alumno elegible se calculará:

`faltantes = frecuencia semanal - asistencias - no_show de reservas - inasistencias semanales ya confirmadas`

Solo se mostrará al alumno cuando `faltantes > 0`. El número visible de inasistencias pendientes se limitará al saldo realmente consumible, descontando las clases ya comprometidas por reservas. Los estados `inactive`, `retired`, `withdrawn`, `blocked` y `suspended` no participarán.

La frecuencia se obtendrá de la membresía con obligación semanal que esté vigente el domingo. Los créditos se consumirán mediante el selector FIFO existente; una membresía de obsequio con frecuencia `0` no elimina la obligación semanal de otra membresía vigente.

## Registro e historial

Cada pulsación registrará exactamente una inasistencia y descontará una clase. El alumno seguirá apareciendo hasta que no queden faltantes. Esto permite revisar cada descuento y mantiene movimientos de crédito individuales.

`student_weekly_attendance` admitirá varias filas por alumno y semana mediante un índice consecutivo. Cada fila conservará `classes_consumed = 1`, la membresía debitada y una nota explicativa. Ejemplo:

> El alumno asistió 1 de las 3 clases requeridas esta semana. Esta clase se considera inasistida.

Las filas existentes conservarán el índice `1`. La operación administrativa seguirá siendo atómica e idempotente frente a pulsaciones repetidas.

## Interfaz administrativa

La tarjeta semanal mostrará para cada alumno:

- clases requeridas;
- asistencias;
- inasistencias ya registradas, incluyendo reservas marcadas `no_show`;
- inasistencias pendientes;
- saldo disponible de la membresía que corresponde consumir.

El botón indicará `Marcar 1 inasistencia`. Tras confirmar, se invalidarán la revisión semanal, el historial del alumno, las membresías y los saldos para reflejar el nuevo estado sin recargar la página.

El editor de planes incluirá `Clases por semana`, con valores de `0` a `4`; `0` significa que el plan no genera una obligación dominical.

## Seguridad y errores

Los RPC conservarán `SECURITY DEFINER`, `search_path` fijo, comprobación de administrador y ejecución anónima revocada. El servidor volverá a calcular el déficit dentro de la transacción antes de descontar. Si ya no existe déficit o saldo libre, no modificará datos y devolverá un resultado idempotente.

## Verificación

- Migración y backfill contractual de planes y membresías.
- Cálculos para frecuencias de una a cuatro clases con asistencia completa, parcial o nula.
- Conteo de `attended`, reservas `no_show` e inasistencias semanales sin duplicados.
- Varios registros semanales, notas, consumo FIFO y protección de reservas futuras.
- Pruebas de servicio y representación de la tarjeta administrativa.
- Suite completa, lint, TypeScript y build.
