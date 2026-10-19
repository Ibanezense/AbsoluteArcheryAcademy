# Resumen operativo semanal

Objetivo aprobado: sustituir las cinco tarjetas diarias del inicio por la semana calendario de lunes a domingo en America/Lima. Mantener el diseño y mostrar fechas y etiqueta «Semana»; cambiar automáticamente al lunes siguiente incluso con la pestaña abierta.

Implementación: consulta agregada admin-only independiente del resumen anterior, sin contar desde la agenda limitada a 80 registros. Reservas no canceladas, turnos programados, pruebas reservadas pendientes y reservas pendientes de asistencia dentro de la semana completa. Cupos libres solo en turnos aún reservables de esa semana; capacidad desconocida continúa siendo N/D y no cero supuesto. Se conserva el método de capacidad por distancias, sin rediseñar reglas de reservas. Ningún registro se borra al comenzar una semana.

1. Pruebas primero: domingo/lunes Lima, cambio de año, fecha UTC diferente y validación de respuestas incompletas.
2. Función SQL aditiva con límite [lunes 00:00, lunes siguiente 00:00), autorización y permisos explícitos; fixture aislada de roles, límites, estados y capacidad.
3. Servicio y hook con clave semanal, refresco periódico, al recuperar foco y temporizador al lunes siguiente.
4. Sustituir tarjetas de inicio y mostrar rango; fallo semanal no debe inventar ceros ni bloquear otros paneles.
5. Verificar tests, SQL aislado, permisos, compilación y navegador; pedir aplicación de migración real una vez revisada. No publicar interfaz.
