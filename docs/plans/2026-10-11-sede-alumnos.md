# Sede de pertenencia del alumno

Guardar una sede opcional en `students.home_location_id`, vinculada a las sedes existentes. No asignar sedes automáticamente a alumnos actuales. Este campo identifica su sede habitual y no restringe sus reservas en otras sedes.

Agregar un selector compartido en Información general y en el formulario de creación/edición. Guardar mediante la API administrativa existente, validando UUID y existencia de la sede antes de modificar cuentas. Si un cliente anterior omite el campo, conservar su valor.

Cargar la relación de sede en la lista y la ficha. Mostrar una etiqueta junto al estado del alumno en escritorio y móvil, con azul para Tiabaya, violeta para Umacollo y «Sin sede asignada» cuando esté vacío. Mantener la invalidación de `studentKeys.all` tras guardar.

Verificar validación, persistencia, compatibilidad de clientes anteriores, permisos existentes, lista y ficha en navegador, lint y compilación. Las comprobaciones de base de datos deben usar transacciones revertidas para conservar los datos reales.

Verificación realizada: 129 archivos y 674 pruebas aprobados; lint, TypeScript y compilación correctos. La migración `20261012014920_student_home_location.sql` está aplicada. Las comprobaciones SQL de relación, borrado explícito, FK y rechazo de escritura no administrativa se revirtieron. Un alumno QA se creó mediante la API, cambió de Tiabaya a Umacollo, conservó su sede con un cliente que omitió el campo y rechazó dos sedes inválidas. Desde el navegador se cambió a Tiabaya, se guardó y se comprobó la etiqueta actualizada en la lista sin recarga forzada. La lista móvil no presenta desbordamiento horizontal. El alumno QA y su acceso se retiraron al finalizar. La revisión independiente no encontró bloqueantes. La interfaz está disponible localmente; no se ha desplegado.
