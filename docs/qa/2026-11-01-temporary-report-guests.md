# QA: invitados temporales en reporte del club

01/11/2026 · Implementado en desarrollo, sin publicación ni cambios de base de datos.

- 202 archivos y 1.107 pruebas aprobadas (`output/guests-final-tests.log`).
- Lint sin errores/advertencias (`output/guests-lint.log`). Compilación completada con salida 0 (`output/guests-final-build.log`).
- Prueba roja inicial: formulario todavía inexistente; verde posterior. Siete pruebas montadas verifican exportación, edición/quitar, validación, duplicados, conflictos con reservas refrescadas, fechas/sedes y recuperación tras fallo.
- Revisión independiente detectó el modo de edición persistente después de descargar. Se corrigió reiniciando el editor; regresión agregar → editar → descargar → agregar otro aprobada y revisión final sin hallazgos importantes.
- PDF sintético con 65 invitados: tres páginas renderizadas, cabeceras/sede/fecha repetidas y DNI sin recortes. Alumnos, clases de prueba y administradores conservados.
- Recorrido de navegador con componente real de reportes, ubicaciones y reservas sintéticas, en banco temporal `output/guests-qa/ui` (sin incluirlo en la app): selección de sede → agregar invitado → vista previa → descarga real. El PDF descargado contiene nombre, etiqueta y DNI con ceros iniciales; tras descargar, lista y formulario quedan vacíos. Capturas móvil 390×844 y escritorio guardadas.
- Se revisó visualmente el PDF descargado en navegador y las páginas inicial/final del PDF largo. No se usaron invitados ni escrituras de producción.

Archivos de evidencia privados: `output/guests-qa/desktop.png`, `mobile.png`, `ingreso-invitados.pdf`, `browser-page-1.png`. El PDF descargado por navegador se guardó en Downloads como `ingreso-archery-tiabaya-01-11-2026.pdf` usando exclusivamente fixtures.

Los datos se mantienen únicamente en memoria de esta pantalla. Cambiar fecha/sede, abandonar pantalla o iniciar una descarga correcta los limpia. Un error de generación conserva el borrador. No hay localStorage, RPC de escritura, migraciones ni cuentas/reservas nuevas.

Pendiente: autorización para integrar y publicar desde main/Vercel. La interfaz publicada actual todavía no contiene esta función.
