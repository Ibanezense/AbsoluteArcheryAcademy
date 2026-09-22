# Sede en turnos manuales

## Contexto

Las plantillas semanales ya pertenecen a una sede, pero el formulario de creación de sesiones manuales no carga ni persiste `location_id`. Esto permite crear turnos sin sede y rompe la separación operativa entre Tiabaya y Umacollo.

## Diseño aprobado

- El formulario de nuevo turno manual consultará las sedes activas desde `academy_locations`.
- La sede será obligatoria y no tendrá un valor implícito al crear.
- Al editar una sesión existente se cargará su `location_id` actual y se conservará si el administrador no la cambia.
- El guardado enviará `location_id` junto con el resto de los datos a `saveAdminSessionWithAllocations`, manteniendo la validación transaccional del servidor.
- El resumen mostrará la sede seleccionada.
- Las plantillas semanales, la generación recurrente y las reservas no se modificarán.

## Manejo de errores

Si no hay sede seleccionada, el formulario no guardará y mostrará un mensaje claro. Si la consulta de sedes o la operación de guardado falla, se conservará el patrón actual de toast de error.

## Verificación

Se añadirá una prueba de regresión que compruebe la carga de sedes, el campo obligatorio, la inclusión de `location_id` en el estado/payload y la visualización en el resumen. Luego se ejecutarán la prueba enfocada, lint y build.
