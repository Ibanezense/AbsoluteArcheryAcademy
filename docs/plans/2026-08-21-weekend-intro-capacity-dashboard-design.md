# Disponibilidad semanal para clases de prueba en el dashboard

**Fecha:** 2026-08-21
**Estado:** Aprobado

## Objetivo

Mostrar en la parte superior del home administrativo la disponibilidad de equipo para clases de prueba durante el fin de semana de la semana actual. El resumen debe permitir identificar de inmediato en qué turnos se puede reservar una clase de prueba sin mezclar otros tipos de arcos ni exigir una recarga manual de la página.

## Alcance funcional

- El bloque se ubica debajo del encabezado del dashboard y antes de la sección `Hoy`.
- Muestra el sábado y domingo pertenecientes a la semana actual en `America/Lima`.
- La ventana cambia automáticamente cada lunes.
- Mantiene siete posiciones visibles:
  - cuatro turnos del sábado;
  - tres turnos del domingo.
- Los turnos se ordenan cronológicamente dentro de cada día.
- Si falta un turno esperado, la posición correspondiente aparece como `No programado`.
- Un turno futuro y disponible ofrece acceso directo a la gestión de clases de prueba.

## Regla de capacidad

La fuente canónica será la regla de disponibilidad de equipo que ya protege las reservas:

- seis arcos activos de academia de 20 lb;
- dos arcos exclusivos de 18 lb para clases de prueba;
- los alumnos regulares con `bow_usage_type = 'shared_inventory'` consumen un arco de academia de 20 lb;
- las primeras dos clases de prueba consumen los arcos exclusivos de 18 lb;
- las clases de prueba adicionales consumen los arcos de academia de 20 lb que sigan libres;
- alumnos con arco propio o arco asignado no consumen este inventario compartido.

Por cada turno, el dashboard mostrará los cupos disponibles para una nueva clase de prueba. El valor debe coincidir con el usado por el RPC de registro, evitando que el dashboard anuncie un cupo que luego no pueda reservarse.

## Estados visuales

Cada tarjeta compacta muestra el día, horario y el estado operativo:

- `N de 8 cupos libres`: disponibilidad normal, tono verde;
- `Último cupo`: un cupo restante, tono ámbar;
- `Lleno`: ningún cupo restante, borde y acento rojo;
- `Finalizado`: el turno ya comenzó o terminó;
- `No programado`: no existe una sesión para esa posición.

La capacidad total visible se deriva del inventario activo (`2 + academy_capacity`) para que la interfaz siga reflejando la configuración real. Con la configuración aprobada actual será ocho.

## Arquitectura y flujo de datos

Se añadirá un RPC de lectura exclusivo para administradores que:

1. determine el sábado y domingo de la semana indicada usando `America/Lima`;
2. lea todas las sesiones programadas de esos dos días, incluidas las llenas;
3. reutilice `get_session_equipment_availability(session_id)` para calcular la disponibilidad real;
4. devuelva horario, capacidad de equipo, ocupación, cupos restantes y estado temporal;
5. no modifique reservas ni inventario.

El RPC será `SECURITY DEFINER`, tendrá `search_path` fijo, validará `auth.uid()` y `is_admin_user()`, revocará acceso público/anónimo y concederá ejecución únicamente a usuarios autenticados y `service_role`.

En frontend se añadirá un servicio tipado y una consulta React Query independiente. El dashboard compondrá los resultados en siete posiciones y reutilizará la invalidación asociada a cambios de reservas y clases de prueba para actualizarse sin F5.

## Interacción

- Las tarjetas disponibles serán enlaces accesibles hacia `/admin/intro`.
- Las tarjetas llenas, finalizadas o no programadas no aparentarán ser reservables.
- El bloque tendrá estados de carga compactos para conservar la estructura visual.
- Un error se mostrará únicamente dentro del bloque, con acción `Reintentar`, sin impedir el uso del resto del dashboard.
- La interfaz conservará el sistema visual administrativo existente: superficies blancas, alta densidad operativa y acentos semánticos verde, ámbar y rojo.

## Pruebas y verificación

- Contrato SQL: permisos administrativos, zona horaria, inclusión de turnos llenos y reutilización del cálculo canónico.
- Utilidades: semana actual de Lima, agrupación 4/3, orden y posiciones no programadas.
- Servicio: mapeo y validación de la respuesta del RPC.
- Dashboard: ubicación superior, siete posiciones y estados visuales.
- Sincronización: invalidación de la consulta después de crear, editar o cancelar una clase de prueba o reserva relevante.
- Verificación final: pruebas focalizadas, suite completa, lint, TypeScript, build de producción y comprobación visual responsive.

## Fuera de alcance

- Modificar el inventario de arcos.
- Cambiar las reglas de reserva existentes.
- Crear automáticamente turnos ausentes.
- Mostrar capacidades de pacas, distancias u otros equipos.
- Permitir reservas directamente dentro de la tarjeta del dashboard.
