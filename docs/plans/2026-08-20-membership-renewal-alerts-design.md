# Avisos de renovación de membresía — Diseño

## Objetivo

Un alumno debe poder entrar a su aplicación aunque su membresía haya vencido o se haya quedado sin clases. La aplicación mostrará un aviso de renovación una vez al día cuando quede exactamente una clase consumible o cuando ya no exista ninguna membresía utilizable. El panel administrativo mostrará el mismo estado y permitirá abrir WhatsApp con el mensaje aprobado para cada caso.

## Incidente de Camila Ramella

Camila accede como alumna vinculada a la cuenta de su tutor. En producción, su relación de acceso es válida y actualmente tiene una membresía nueva activa. La captura del incidente también muestra que el teléfono estaba sin conexión; una membresía vencida no debe provocar la pantalla global de error y un fallo de red debe presentarse explícitamente como un problema de conexión.

La corrección no dependerá del caso particular de Camila: se definirá un estado canónico aplicable a todos los alumnos y se reforzarán los límites de error para que ni el vencimiento ni la indisponibilidad de red desmonten la aplicación.

## Estado canónico de renovación

El servidor expondrá un único cálculo con tres resultados:

- `none`: no corresponde mostrar ni enviar aviso.
- `last_class`: queda exactamente una clase sin consumir entre todas las membresías vigentes o programadas y existe una membresía vigente hoy.
- `expired`: el alumno tuvo membresías, pero no tiene ninguna membresía vigente o programada con clases sin consumir.

Las clases consumidas son únicamente las registradas mediante asistencia `attended` o inasistencia `no_show`, porque son esos estados los que descuentan saldo. Una reserva `reserved` no consume la clase; por tanto, una última clase ya reservada continúa siendo la última clase de la membresía hasta que se resuelva la asistencia.

Una membresía cuya fecha final ya pasó no aporta clases utilizables, aunque conserve saldo contable. Si existe otra membresía vigente o programada con saldo, no se mostrará el aviso de vencimiento. Cuando haya varias membresías, el cálculo respetará el modelo FIFO existente: la academia consume primero la de fecha de inicio más antigua, pero el aviso de renovación observará el saldo no consumido total para no pedir una renovación a quien ya tiene otro ciclo pagado o programado.

El resultado incluirá una clave estable derivada del estado y de las membresías consideradas. Esa clave permitirá distinguir un aviso anterior de un nuevo ciclo o de un cambio entre `last_class` y `expired`.

## Acceso y errores de conexión

El acceso autenticado no dependerá de que exista una membresía activa. `AuthGuard` seguirá validando la sesión y nunca interpretará un error de red como ausencia de membresía.

La pantalla global de error y las superficies de carga distinguirán:

- sin conexión: mensaje claro para recuperar Internet y reintentar;
- error de datos: mensaje de reintento sin sugerir al alumno revisar registros del servidor;
- membresía vencida: pantalla normal del alumno, saldo utilizable cero y aviso de renovación.

El aviso de renovación se aislará para que un error al cargar planes o solicitudes no pueda derribar la página principal. Si falla esa consulta, el alumno conservará acceso a la app y verá un mensaje local dentro del popup.

## Popup del alumno

`MembershipRenewalPrompt` consumirá el estado canónico y tendrá dos variantes:

### Última clase

Título: `Te queda una sola clase`

Mensaje: `Te queda 1 clase disponible de tu membresía. Puedes renovarla ahora para continuar tus entrenamientos sin interrupciones.`

### Membresía vencida

Título: `Renueva tu membresía`

Mensaje: `No te quedan clases disponibles. Debes renovar tu membresía para continuar tus clases y realizar nuevas reservas.`

El alumno podrá cerrar el popup y seguir navegando. El cierre se guardará en `localStorage` con zona horaria `America/Lima`, alumno, estado y clave del ciclo. Se volverá a mostrar como máximo una vez por día mientras el estado siga vigente; un cambio de estado o de ciclo permitirá mostrar el nuevo aviso inmediatamente.

La variante vencida podrá conservar el flujo existente de selección de plan y solicitud de renovación. La variante de última clase ofrecerá el mismo acceso anticipado a la renovación.

## Panel administrativo y WhatsApp

Las tarjetas de `/admin/alumnos` y el perfil `/admin/alumnos/[id]` mostrarán una señal visual para `last_class` y `expired`. Solo esos estados tendrán acción de WhatsApp.

Mensaje para `last_class`:

```text
Hola 👋 Te contamos que actualmente te queda **1 clase disponible** de tu membresía.
Para que puedas continuar con tus entrenamientos sin interrupciones, te recomendamos renovar antes de utilizar tu última clase. 🏹
```

Mensaje para `expired`:

```text
Hola 👋 Te informamos que tu membresía ya se encuentra **vencida** y actualmente no tienes clases disponibles.
Para continuar con tus entrenamientos y poder reservar nuevas clases, es necesario realizar la renovación de tu membresía. 🏹
```

El teléfono se normalizará para `wa.me`, conservando prefijos internacionales y agregando `51` a números peruanos locales válidos. Si no existe un teléfono utilizable, la interfaz mostrará la razón y no abrirá un enlace incompleto. Los textos se codificarán sin alterar los asteriscos aprobados para el formato de WhatsApp.

## Contrato de datos y seguridad

Una migración aditiva creará una RPC de lectura por lote para obtener los estados de renovación de alumnos accesibles. La función:

- comprobará `auth.uid()`;
- permitirá todos los alumnos solicitados al rol admin;
- restringirá student/guardian mediante `can_access_student(student_id)`;
- usará `SECURITY DEFINER` con `search_path = public` fijo;
- revocará acceso de `PUBLIC` y `anon`;
- concederá ejecución a `authenticated` y `service_role`.

No se persistirán notificaciones: son una proyección determinista de membresías y saldos existentes. Esto evita estados obsoletos y mantiene una sola fuente de verdad.

## Actualización automática

El hook del estado usará TanStack Query. Después de asignar, editar, consumir, expirar o renovar una membresía se invalidarán tanto `studentKeys.all` como la clave de alertas. Así, alumno y administrador cambiarán de estado sin refrescar manualmente la página.

## Pruebas y verificación

- SQL: una clase, cero clases, vencimiento por fecha con saldo contable, membresía futura, varias membresías y control de acceso.
- Utilidades: clave diaria Lima, textos exactos y URL de WhatsApp.
- Alumno: popup correcto, una vez al día, cambio de estado, cierre sin bloquear navegación y error local de planes.
- Admin: indicador y botón en lista/detalle, teléfono faltante y texto exacto.
- Red: error global y autenticación muestran un estado de conexión comprensible, no un falso vencimiento.
- Regresión: `npm test`, `npm run lint`, `npm run build` y `git diff --check`.
- Producción: aplicar migración, validar el estado de un caso controlado, verificar Camila con su nueva membresía y comprobar las dos interfaces autenticadas antes del despliegue final.
