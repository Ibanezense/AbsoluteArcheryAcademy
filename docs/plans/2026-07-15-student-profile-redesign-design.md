# Diseño: reestructuración del perfil del alumno

**Fecha:** 2026-07-15  
**Estado:** Aprobado

## Objetivo

Reestructurar el perfil administrativo del alumno para convertirlo en una ficha operativa compacta, clara y navegable, alineada con la nueva lista de alumnos. El menú lateral actual se conserva sin cambios.

La primera etapa reutiliza el modelo y las operaciones persistentes existentes. No mostrará como funcionales capacidades financieras que todavía no tienen soporte completo en Supabase.

## Dirección de diseño

La interfaz tendrá una estética administrativa refinada y de alta densidad: jerarquía tipográfica clara, tarjetas blancas, bordes suaves, estados visibles y tablas compactas. El encabezado reunirá la identidad del alumno y las pestañas organizarán la información sin duplicarla.

Se conservará el sistema visual existente de la aplicación y se evitará introducir una identidad paralela o modificar la navegación lateral.

## Arquitectura de interfaz

El perfil se dividirá en un contenedor común y seis módulos de pestaña:

1. **Perfil**
2. **Datos deportivos**
3. **Asistencias**
4. **Membresía**
5. **Pagos**
6. **Reservas**

El encabezado incluirá:

- navegación de regreso a la lista;
- foto o avatar de respaldo;
- nombre completo;
- estado operativo calculado con las reglas de la lista de alumnos;
- código de acceso del alumno, con control para mostrarlo o copiarlo;
- acceso a la edición general existente.

Las pestañas serán desplazables horizontalmente en pantallas pequeñas y mantendrán una indicación visible de la selección actual.

## Contenido por pestaña

### Perfil

Mostrará la identidad del alumno y su información general:

- nombre completo;
- género;
- correo electrónico;
- teléfono;
- DNI;
- fecha de nacimiento;
- edad calculada automáticamente.

La edición seguirá usando las operaciones existentes. Los valores ausentes tendrán estados vacíos explícitos y no se sustituirán con datos inventados.

### Datos deportivos

Mostrará:

- disciplina: recurvo, compuesto o raso;
- categoría calculada o registrada;
- nivel;
- mano dominante;
- distancia actual;
- arco propio;
- arco asignado;
- arco de academia y potencia, cuando corresponda.

Los campos que todavía no existan en el modelo, como mano dominante, requerirán una ampliación aditiva mínima del alumno y su flujo de edición. La configuración del arco reutilizará `has_own_bow`, `assigned_bow` y `bow_poundage`.

### Asistencias

Usará las reservas ya procesadas como fuente operativa:

- `attended`: asistencia;
- `no_show`: inasistencia;
- `cancelled`: cancelación.

Incluirá contadores por resultado, filtros por estado y rango temporal, además de agrupación cronológica. Las reservas aún vigentes no aparecerán aquí.

### Membresía

Mostrará el historial completo de membresías en una tabla compacta con:

- membresía;
- fecha de inicio;
- fecha de finalización;
- estado;
- importe;
- tipo de pago disponible;
- acciones.

Las acciones soportadas actualmente seguirán siendo funcionales: editar nombre, fechas, estado, clases, importe, moneda y notas; también eliminar una membresía cuando las reglas vigentes lo permitan.

El número de documento autogenerado, cambio formal de plan, fecha de facturación, descuento y congelamiento no se simularán en esta etapa. Se incorporarán posteriormente junto con su modelo persistente, auditoría y reglas de negocio.

### Pagos

Tendrá dos secciones:

1. **Documentos de pago:** vista derivada de los registros disponibles, sin fabricar numeración fiscal ni estados inexistentes.
2. **Transacciones:** fecha, importe, método de pago, acción o estado y membresía relacionada.

La futura implementación de documentos numerados deberá crear una entidad propia y una secuencia segura en Supabase antes de habilitar controles de emisión o facturación.

### Reservas

Mostrará únicamente reservas con estado `reserved`, es decir, aquellas que todavía no se convirtieron en asistencia, cancelación o inasistencia.

La tabla incluirá fecha, horario, distancia, tipo de arco y estado. Las reservas ya procesadas quedarán exclusivamente en Asistencias para evitar duplicación conceptual.

## Arquitectura técnica

La página actual se dividirá en componentes mantenibles por pestaña, con un contenedor responsable de:

- cargar el detalle del alumno;
- calcular y presentar el estado operativo;
- controlar la pestaña activa;
- compartir las acciones comunes;
- resolver estados de carga, error y alumno inexistente.

La consulta de detalle se ampliará solo con los campos necesarios y conservará React Query como mecanismo de lectura e invalidación. Las mutaciones existentes seguirán usando los RPC administrativos vigentes.

Los nuevos campos simples del alumno se introducirán de forma aditiva y se integrarán al formulario administrativo existente. No se modificarán flujos públicos ni el menú lateral.

## Estados y reglas de presentación

El estado del encabezado usará las mismas reglas de la lista:

- activo;
- por vencer;
- vencido;
- en pausa;
- inactivo.

No habrá un segundo cálculo divergente dentro del perfil. La lógica común deberá reutilizarse desde una utilidad compartida.

Cada tabla tendrá estados de carga, vacío y error. En móvil se priorizará legibilidad mediante desplazamiento horizontal controlado o filas adaptativas, sin ocultar datos críticos.

## Accesibilidad y comportamiento

- Las pestañas expondrán semántica de `tablist`, `tab` y `tabpanel`.
- Los botones tendrán etiquetas accesibles y foco visible.
- El código de acceso estará oculto inicialmente.
- Los menús de acciones podrán operarse con teclado.
- Las fechas y estados mantendrán texto además del color.

## Verificación

La implementación se considerará completa cuando:

- las seis pestañas presenten los datos acordados;
- Perfil y Datos deportivos permitan llegar al editor funcional;
- los filtros de Asistencias funcionen con datos reales;
- Membresía conserve sus mutaciones existentes;
- Pagos muestre datos reales sin numeración inventada;
- Reservas excluya estados procesados;
- el cálculo de estado coincida con la lista de alumnos;
- pasen las pruebas relevantes, lint y build;
- la ruta se verifique visualmente en el servidor de producción local;
- el servidor quede ejecutándose en segundo plano para revisión.

## Fuera de alcance de esta etapa

- documentos fiscales o comprobantes numerados persistentes;
- secuencias de numeración;
- descuentos de membresía;
- congelamiento de membresía;
- fecha de facturación;
- cambio formal de plan con trazabilidad;
- rediseño del menú lateral;
- cambios en las pantallas públicas del alumno.
