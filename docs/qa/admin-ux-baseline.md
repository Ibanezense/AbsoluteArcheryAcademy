# Línea base: administrador

Fecha de auditoría: 18 de octubre de 2026. Revisión inicial: `c619daa`.

Pruebas iniciales: 131 archivos, 685 pruebas aprobadas. Las pruebas de estructura no acreditan una experiencia correcta; la auditoría visual detectó defectos pese a esa línea base.

Las capturas privadas originales permanecen en `D:\PROGRAMACION\archery-reservas-pwa\output\auditoria-admin-2026-10-18`. No se incluyen en Git.

| Medición | Antes |
|---|---|
| Pantalla móvil | 390 × 844 |
| Comienzo del bloque Hoy | Aproximadamente 3206 px desde el inicio |
| Altura del inicio | Aproximadamente 11564 px |
| Reserva rápida, ancho contenedor/contenido | 334 / 396 px |
| Primer selector de alumno en Membresías | Aproximadamente 2407 px |
| Altura de Finanzas con el periodo observado | Aproximadamente 14945 px |

No se midieron tiempos de tarea durante la auditoría original. No se reconstruyen ni inventan valores para compararlos con el resultado nuevo. Las mediciones finales deben conservar fecha, población y tamaño de pantalla.

## Diagnósticos confirmados mediante lectura

- 1032 reservas asistidas frente a 1000 filas devueltas por la consulta sin paginación. El cálculo anterior de última asistencia resultó diferente para 24 alumnos. No se modificaron registros para diagnosticarlo.
- `calendarDate('2026-10-18')` trataba una fecha civil como instante UTC y podía devolver el día 17 en Lima.
- Turnos usaba `startOf('week').add(1, 'day')`, dependiente del idioma; Pruebas ya disponía de `weekDates` con fechas civiles.
- La serie de barras decorativa de las métricas estaba fijada en el código y no representaba datos reales.
- La campana no tenía acción asociada.

## Límites de los entornos

El entorno local utiliza la conexión configurada a la base existente. Se permiten comprobaciones de lectura y apertura de formularios; no se crean alumnos, reservas o pagos ficticios en esa base. Los tests SQL transaccionales nuevos se preparan para una base de prueba. No ejecutar escrituras de negocio sobre producción para completar una captura.
