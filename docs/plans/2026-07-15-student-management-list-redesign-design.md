# Rediseño de la lista de alumnos

## Objetivo

Reestructurar `/admin/alumnos` como una superficie operativa compacta para localizar alumnos, revisar su situación actual y entrar rápidamente a su perfil o edición. El menú lateral y el resto de las pantallas administrativas quedan fuera de alcance.

## Dirección visual

La pantalla adoptará una estética administrativa sobria y densa, inspirada en la tabla de miembros compartida como referencia, pero alineada con el sistema visual actual de Absolute Archery Academy. Se priorizarán la lectura rápida, la jerarquía tipográfica y los estados reconocibles sobre tarjetas, gráficos o elementos decorativos.

## Estructura de la pantalla

- Encabezado simple con título `Alumnos`, una descripción breve y la acción primaria `Agregar alumno`.
- Barra de herramientas única con búsqueda por nombre, DNI o teléfono, filtro por estado y contador de resultados.
- Tabla de escritorio con las columnas `Alumno`, `Teléfono`, `Membresía`, `Última asistencia`, `Fecha de ingreso` y `Acciones`.
- La celda de alumno mostrará avatar, nombre y estado visible.
- El nombre y la fila permitirán abrir el perfil. El menú de acciones conservará accesos explícitos a `Ver perfil` y `Editar`.
- En móvil, cada fila se convertirá en un bloque compacto de dos columnas, sin desplazamiento horizontal.

La nueva pantalla reemplazará las tarjetas estadísticas, gráficos, alertas laterales, acciones rápidas y el buscador duplicado que existen actualmente en `/admin/alumnos`.

## Estados visibles

La lista presentará cuatro estados administrativos, sin modificar los estados internos ni las reglas de negocio:

- `Activo`: alumno operativo con membresía vigente y clases disponibles.
- `Por vencer`: alumno activo cuya membresía termina en siete días o menos.
- `En pausa`: alumno pausado temporalmente o sin una membresía vigente, con posibilidad de retorno.
- `Inactivo`: agrupación visual de alumnos retirados, dados de baja, bloqueados o suspendidos.

Los colores serán verde para activo, ámbar para por vencer, azul o gris para en pausa y rojo o gris oscuro para inactivo.

## Datos y flujo

La consulta seguirá partiendo de `students`, porque el alumno es la entidad académica y operativa. Se conservará la selección de la membresía vigente o más reciente desde `student_memberships`.

Se añadirán a la fila de consulta:

- `students.created_at` para la fecha de ingreso.
- La reserva asistida más reciente del alumno para `Última asistencia`.

La última asistencia considerará únicamente reservas con estado `attended`. Cuando no exista ninguna, la interfaz mostrará `Sin asistencias`. Los datos faltantes de teléfono o membresía tendrán estados vacíos claros y no romperán la fila.

La búsqueda y el filtro se resolverán en cliente sobre la lista ya cargada, manteniendo el comportamiento actual. No se agregará paginación en esta primera reestructuración.

## Componentes y comportamiento

- Un componente de estado centralizará etiquetas, colores y agrupación visual.
- Una fila de escritorio y una presentación móvil compartirán el mismo modelo derivado del alumno.
- El filtro será accesible por teclado y tendrá las opciones `Todos`, `Activos`, `Por vencer`, `En pausa` e `Inactivos`.
- Durante la carga se mostrará un esqueleto o estado de tabla estable.
- Una búsqueda sin coincidencias mostrará un mensaje útil y conservará los controles visibles.
- Los errores de consulta continuarán siendo gestionados por React Query; la página presentará un estado explícito con opción de reintento.

## Verificación

- Pruebas unitarias de la transformación de datos para `created_at`, última asistencia y agrupación de estados.
- Pruebas de filtrado por los cuatro estados visibles.
- ESLint, pruebas automatizadas y build de producción.
- Verificación funcional de `/admin/alumnos` en escritorio y móvil, incluyendo búsqueda, filtro, navegación al perfil y navegación a edición.

## Fuera de alcance

- Cambios al menú lateral o al layout administrativo.
- Cambios al modelo de estados de Supabase.
- Paginación, exportaciones o acciones masivas.
- Rediseño del perfil o formulario de edición del alumno.
