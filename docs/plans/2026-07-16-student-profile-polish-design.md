# Rediseño operativo del perfil de alumnos

## Objetivo

Corregir la presentación y edición del perfil del alumno, diferenciar de forma inequívoca los tres tipos de arco y rehacer la gestión de membresías dentro de la propia ficha.

## Dirección visual

La interfaz seguirá un lenguaje administrativo refinado y compacto: tarjetas blancas con jerarquía clara, campos agrupados por contexto, espacios generosos y tablas reservadas únicamente para historiales. Perfil y Datos deportivos serán formularios, no cuadrículas que imiten hojas de cálculo.

## Perfil

- Mantener una cabecera de identidad con fotografía, nombre, estado y código de acceso.
- Mostrar un formulario editable con información personal, contacto y documento.
- Calcular la edad automáticamente a partir de la fecha de nacimiento.
- Mostrar siempre nombre, email y teléfono del tutor. Cuando no exista un tutor, los campos estarán vacíos y permitirán crearlo.
- Guardar todos los cambios desde un único botón visible.

## Datos deportivos y equipos

- Presentar disciplina, categoría, nivel, mano dominante y distancia mediante controles editables agrupados.
- Usar una selección exclusiva para `Arco propio`, `Arco asignado` y `Arco de academia`.
- Interpretar `has_own_bow = false` y `assigned_bow = false` como arco de academia, sin inferir asignación por el libraje.
- El libraje describe el equipo utilizado, pero nunca determina el tipo de arco.

## Membresías

- Reemplazar la superficie existente por una tabla con: membresía, fecha de inicio, fecha de finalización, número de documento, estado, tipo de pago y acciones.
- Abrir la asignación de una membresía en un panel lateral dentro de la ficha del alumno.
- Incluir plan, fecha de inicio, tipo de pago, pago recibido, descuento y resumen del precio.
- Añadir un menú de tres puntos por membresía con información, cancelación, fechas, plan, tipo de pago, fecha de facturación, descuento y congelamiento o reactivación.
- Mantener las operaciones existentes y ampliar el modelo de forma aditiva para persistir los nuevos atributos.

## Acciones generales

La cabecera incluirá un menú `Acciones` con accesos a asignar membresía, reservar clase, bloquear o reactivar y eliminar al alumno.

## Compatibilidad y datos

- Las migraciones serán aditivas e idempotentes.
- Los registros históricos sin los nuevos campos usarán valores de presentación seguros.
- Asistencias, Pagos y Reservas conservarán su comportamiento actual.
- Todos los textos visibles corregirán acentos, eñes y caracteres dañados.

## Verificación

- Pruebas unitarias para la normalización del tipo de arco y atributos de membresía.
- Pruebas estructurales para campos editables, menús y panel lateral.
- Suite completa, ESLint, build de producción y comprobación visual autenticada cuando haya sesión disponible.
- El servidor de producción quedará activo al finalizar.
