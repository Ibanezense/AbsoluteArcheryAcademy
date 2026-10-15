# Lista diaria de ingreso por sede

La descarga exige seleccionar fecha y una sede, sin opción de agrupar todas. La sede corresponde al turno de la reserva, no a la sede habitual del alumno. Se conserva la inclusión de alumnos reservados/asistidos, clases de prueba y administradores fijos del reporte existente.

Agregar un RPC administrativo con fecha y sede obligatorias. Filtrar las sesiones antes de reunir alumnos y prospectos. Mantener la firma anterior compatible durante la transición de la interfaz publicada.

La vista previa y su caché se separan por fecha y sede. No descargar mientras no exista sede válida, la consulta esté cargando o haya fallado. Cambiar sede o fecha durante la generación queda deshabilitado. El encabezado de cada página y el nombre del archivo identifican la sede.

Verificar aislamiento con datos de ambas sedes dentro de una transacción revertida, rechazo de sede nula/inexistente y permisos. Revisar un PDF multipágina con datos sintéticos y ejecutar pruebas, lint y compilación.

Verificación realizada: 130 archivos y 676 pruebas aprobadas; lint y build correctos. Migración aplicada y sincronizada con el historial remoto (`20261015134053`). Aislamiento SQL comprobado con alumnos cuya sede habitual es opuesta a la de la reserva, prospectos de ambas sedes y cancelaciones; todos los datos sintéticos revertidos. Se rechazaron consultas sin autenticación y sin sede válida. Se revisaron PDFs sintéticos de cuatro páginas: cada página identifica fecha y sede. La descarga real del navegador generó `ingreso-archery-umacollo-15-10-2026.pdf` y se verificó su contenido. Cambiar a Tiabaya reemplazó la lista de tres pruebas de Umacollo por cuatro alumnos de Tiabaya, además de los tres administradores existentes. Al quitar la sede, la vista previa se vacía y Descargar PDF queda deshabilitado. Revisión independiente sin bloqueantes. Interfaz disponible localmente; pendiente de publicación.
