# Horarios recurrentes de clases de prueba por sede

## Objetivo

Permitir que administración defina qué turnos recurrentes de Tiabaya y Umacollo aceptan clases de prueba, y que al registrar o reprogramar una prueba primero se elija la sede y después uno de sus turnos habilitados con capacidad real.

## Decisiones aprobadas

- Los horarios para pruebas son recurrentes y se repiten semanalmente hasta que administración los modifique.
- Las pruebas utilizan sesiones normales existentes. No se crea una agenda paralela.
- Administración puede agregar un nuevo día u horario cuando amplíe la atención.
- Las reservas de prueba comparten pacas, arcos y capacidad con las demás reservas del turno.
- Tiabaya y Umacollo se seleccionan explícitamente antes del horario.

## Modelo de datos

Agregar `allows_intro` a `weekly_session_templates`, con valor predeterminado `false`.

La plantilla semanal será la fuente de verdad para saber si sus sesiones aceptan nuevas pruebas. Las sesiones conservarán su `weekly_template_id`; no se duplicará la configuración en otra tabla.

Backfill inicial:

- Habilitar los turnos que actualmente se utilizan para pruebas en Tiabaya.
- Habilitar los seis turnos activos de Umacollo de miércoles a viernes.
- Mantener deshabilitados los turnos inactivos del martes en Umacollo.

## Configuración administrativa

En `Configuración → Infraestructura` se añadirá la sección `Horarios para clases de prueba`, agrupada por sede.

Cada turno mostrará:

- sede;
- día;
- hora inicial y final;
- duración;
- estado general de la plantilla;
- estado `Acepta clases de prueba`.

El formulario de plantilla semanal incorporará obligatoriamente la sede y el control de disponibilidad para pruebas. Al agregar un nuevo día se creará una plantilla normal ligada a la sede, con su capacidad, distancia y equipamiento configurables mediante los mecanismos existentes.

Al guardar o activar una plantilla, administración podrá generar las sesiones faltantes del horizonte operativo sin duplicar sesiones existentes. Deshabilitar pruebas no cancelará reservas ya creadas ni eliminará sesiones; solo bloqueará nuevas reservas de prueba.

## Flujo de registro y reprogramación

El modal de nueva clase de prueba seguirá este orden:

1. Datos del prospecto.
2. Selección explícita de sede.
3. Selección de fecha y turno disponible en esa sede.
4. Tipo de clase y pago.
5. Confirmación.

Al cambiar de sede se limpiará el turno seleccionado. Los horarios mostrarán fecha, hora, duración, sede y cupos restantes. Una sede sin turnos habilitados o sin cupos mostrará un estado vacío claro.

La edición conservará el turno actual aunque la plantilla haya dejado de aceptar pruebas. Si administración decide reprogramar, solo podrá seleccionar un turno habilitado y con capacidad.

## Reglas de servidor

`get_available_intro_sessions` devolverá únicamente sesiones futuras que:

- pertenezcan a una sede activa y abierta;
- provengan de una plantilla activa con `allows_intro = true`;
- tengan capacidad física y arco compatible para una prueba;
- estén dentro del rango solicitado;
- coincidan con la sede solicitada cuando se envíe el filtro.

`admin_register_intro_class` y `admin_update_intro_class` volverán a comprobar dentro de la transacción que el turno acepta pruebas y mantiene capacidad. La interfaz será una ayuda, no la autoridad final.

Las firmas existentes conservarán compatibilidad cuando sea posible mediante parámetros opcionales o funciones wrapper.

## Casos de error

- Si el turno se llena antes de confirmar, se rechazará la operación y se recargarán los horarios.
- Si la plantilla fue deshabilitada, se informará que el turno ya no acepta pruebas.
- Si la sede está inactiva o aún no abrió, no aparecerá como opción disponible.
- Una modificación de plantilla no moverá ni cancelará reservas existentes.

## Verificación

- Tiabaya solo muestra sus horarios habilitados.
- Umacollo solo muestra sus horarios habilitados.
- Cambiar de sede elimina el horario seleccionado previamente.
- Una plantilla deshabilitada desaparece de nuevas reservas, pero conserva sus reservas existentes.
- Un nuevo día recurrente genera sesiones futuras sin duplicados.
- Dos reservas concurrentes no pueden tomar el último cupo o arco.
- Registro y reprogramación validan las reglas también desde el servidor.
- La experiencia se comprueba en móvil y escritorio.

