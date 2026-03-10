# Fase 1 - Modelo de datos V2

## Objetivo

Redisenar la base funcional de la app para soportar estos casos reales:

- El admin crea todas las cuentas. No existe auto-registro.
- Un alumno puede entrar con su propia cuenta.
- Un padre o tutor puede entrar con una sola cuenta y ver a varios hijos.
- Las reservas, membresias y saldo de clases pertenecen al alumno, no a la cuenta que inicia sesion.
- La app debe mostrar paquete adquirido, clases restantes, vigencia y reservas por alumno.

## Regla principal

Separar `cuenta` de `alumno`.

Hoy el sistema mezcla ambas cosas en `profiles`. Eso funciona para "1 usuario = 1 alumno", pero no para padres con varios hijos.

En V2:

- `profiles` representa a la persona que inicia sesion.
- `students` representa al alumno real sobre el que existen membresias, reservas y asistencia.

## Modelo objetivo

### 1. `profiles`

Mantener `profiles` como tabla de cuenta/autenticacion.

Campos que deben quedar asociados a la cuenta:

- `id`
- `full_name`
- `email`
- `phone`
- `avatar_url`
- `role`
- `is_active`
- `created_at`

Roles definidos:

- `admin`
- `guardian`
- `student`

Notas:

- Un padre/tutor usa `role = 'guardian'`.
- Un alumno con acceso propio usa `role = 'student'`.
- Un admin crea esta cuenta y luego entrega credenciales.
- El rol `coach` queda deprecado. Todo lo operativo lo hace `admin`.
- El acceso se identifica con un `access_code` de 8 digitos, alineado al DNI.
- `profiles` ya no debe ser la fuente principal de membresia ni de clases restantes.

### 2. `students`

Nueva tabla central del dominio.

Cada fila representa a un alumno.

Campos propuestos:

- `id uuid primary key`
- `full_name text not null`
- `avatar_url text null`
- `date_of_birth date null`
- `dni char(8) null`
- `phone text null`
- `email text null`
- `medical_notes text null`
- `current_distance_m integer null`
- `category text null`
- `level text null`
- `has_own_bow boolean not null default false`
- `assigned_bow boolean not null default false`
- `bow_poundage integer null`
- `is_active boolean not null default true`
- `self_profile_id uuid null references profiles(id)`
- `created_by uuid not null references profiles(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Reglas:

- `self_profile_id` solo se usa si el alumno tambien tiene cuenta propia.
- Un alumno puede existir sin login propio.
- Un padre no vive en `students`; vive en `profiles`.

### 3. `student_guardians`

Nueva tabla puente para relacionar cuentas tutor con alumnos.

Campos propuestos:

- `id uuid primary key`
- `student_id uuid not null references students(id) on delete cascade`
- `guardian_profile_id uuid not null references profiles(id) on delete cascade`
- `relationship text null`
- `is_primary boolean not null default false`
- `can_view_profile boolean not null default true`
- `can_view_memberships boolean not null default true`
- `can_book boolean not null default true`
- `can_cancel_booking boolean not null default true`
- `can_view_payments boolean not null default true`
- `created_by uuid not null references profiles(id)`
- `created_at timestamptz default now()`

Indice unico recomendado:

- unique (`student_id`)
- unique (`guardian_profile_id`, `student_id`)

Regla de negocio actual:

- un padre con varios hijos
- un solo tutor por alumno

Por eso conviene mantener la tabla puente, pero forzando maximo un tutor por alumno.

### 4. `membership_plans`

Catalogo de paquetes vendibles.

Puede reemplazar o normalizar la tabla `memberships` actual si esa tabla hoy esta cumpliendo mezcla de catalogo e historial.

Campos propuestos:

- `id uuid primary key`
- `name text not null`
- `description text null`
- `classes_included integer not null`
- `duration_days integer null`
- `price_amount numeric(10,2) null`
- `currency text not null default 'PEN'`
- `is_active boolean not null default true`
- `created_at timestamptz default now()`

### 5. `student_memberships`

Historial real de paquetes comprados por alumno.

Esta debe ser la fuente de verdad para vigencia y clases.

Campos propuestos:

- `id uuid primary key`
- `student_id uuid not null references students(id) on delete cascade`
- `membership_plan_id uuid null references membership_plans(id)`
- `custom_name text not null`
- `classes_total integer not null`
- `classes_used integer not null default 0`
- `classes_remaining integer not null`
- `start_date date not null`
- `end_date date null`
- `status text not null`
- `amount_paid numeric(10,2) not null default 0`
- `currency text not null default 'PEN'`
- `sold_by_profile_id uuid not null references profiles(id)`
- `notes text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Estados recomendados:

- `draft`
- `active`
- `expired`
- `cancelled`
- `consumed`

Regla:

- Solo una membresia `active` por alumno al mismo tiempo, salvo que quieras paquetes paralelos.

### 6. `class_credit_ledger`

Nueva tabla de movimientos de saldo.

No es obligatoria para arrancar, pero la recomiendo mucho porque elimina ambiguedad.

Campos propuestos:

- `id uuid primary key`
- `student_id uuid not null references students(id) on delete cascade`
- `student_membership_id uuid null references student_memberships(id)`
- `booking_id uuid null references bookings(id)`
- `movement_type text not null`
- `delta integer not null`
- `balance_after integer null`
- `reason text not null`
- `performed_by_profile_id uuid null references profiles(id)`
- `created_at timestamptz default now()`

Ejemplos de `movement_type`:

- `membership_activation`
- `booking_reserved`
- `booking_cancelled_refund`
- `admin_adjustment`
- `migration_seed`

Beneficios:

- auditoria real
- reconstruccion de saldo
- menos riesgo de desbalance entre reservas y clases
- soporte limpio para recuperaciones, premios por puntualidad y premios por constancia

### 7. `student_membership_payments`

Nueva tabla real de pagos.

Objetivo:

- registrar pagos de membresias
- registrar fechas reales de pago
- soportar premios por puntualidad
- soportar premios por constancia
- dejar trazabilidad de descuentos y abonos

Campos propuestos:

- `id uuid primary key`
- `student_id uuid not null references students(id) on delete cascade`
- `student_membership_id uuid not null references student_memberships(id) on delete cascade`
- `due_date date null`
- `paid_at timestamptz not null`
- `amount numeric(10,2) not null`
- `currency text not null default 'PEN'`
- `payment_method text null`
- `payment_status text not null`
- `reward_credits integer not null default 0`
- `reward_reason text null`
- `notes text null`
- `recorded_by_profile_id uuid not null references profiles(id)`
- `created_at timestamptz default now()`

### 8. `sessions`

Mantener `sessions` como agenda de clases, pero ya no dependiente del perfil del alumno.

Debe seguir guardando:

- horario
- coach
- capacidades por grupo
- asignaciones por distancia
- estado

### 9. `bookings`

La reserva debe pertenecer al alumno.

Campos objetivo:

- `id uuid primary key`
- `student_id uuid not null references students(id) on delete cascade`
- `session_id uuid not null references sessions(id) on delete cascade`
- `status booking_status not null`
- `booked_by_profile_id uuid null references profiles(id)`
- `active_membership_id uuid null references student_memberships(id)`
- `distance_m integer null`
- `group_type text null`
- `admin_notes text null`
- `attendance_marked_by uuid null references profiles(id)`
- `attendance_marked_at timestamptz null`
- `cancelled_by_profile_id uuid null references profiles(id)`
- `cancelled_at timestamptz null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Reglas:

- Si reserva un padre, `booked_by_profile_id` apunta al tutor.
- Si reserva el propio alumno, `booked_by_profile_id` apunta a su cuenta.
- Si reserva un admin, tambien queda trazabilidad.

## Que deja de vivir en `profiles`

Estos campos no deberian seguir siendo fuente principal:

- `membership_type`
- `membership_start`
- `membership_end`
- `classes_remaining`
- `distance_m`
- `group_type`

Se pueden mantener temporalmente durante migracion, pero luego deben volverse derivados o eliminarse.

## Reglas de acceso

### Alumno con cuenta propia

Puede ver:

- su registro en `students` a traves de `self_profile_id`
- sus membresias
- sus reservas

Puede reservar solo para si mismo.

### Padre o tutor

Puede ver solo alumnos vinculados en `student_guardians`.

Puede:

- listar sus hijos
- cambiar entre perfiles de alumno
- ver membresias por hijo
- reservar y cancelar por hijo

### Admin

Puede:

- crear cuentas en `profiles`
- crear alumnos en `students`
- vincular tutores en `student_guardians`
- vender paquetes
- activar membresias
- reservar manualmente
- marcar asistencia

## Flujo de alta correcto

### Caso 1: alumno con cuenta propia

1. Admin crea cuenta en `profiles` con `role = 'student'`.
2. Admin crea `students`.
3. `students.self_profile_id = profiles.id`.
4. Admin asigna tutor si aplica.
5. Admin vende paquete.

### Caso 2: padre con varios hijos

1. Admin crea cuenta del padre en `profiles` con `role = 'guardian'`.
2. Admin crea uno o varios registros en `students`.
3. Admin crea relaciones en `student_guardians`.
4. Cada hijo recibe su propia membresia.

### Caso 3: hijo con cuenta propia y tambien padre asociado

Se permite combinar:

- `students.self_profile_id = cuenta del alumno`
- una fila en `student_guardians`

Eso cubre alumnos mayores con acceso propio y padres que igualmente supervisan.

## Estrategia de migracion

### Fase A - convivencia

Crear tablas nuevas sin romper pantallas actuales:

- `students`
- `student_guardians`
- `membership_plans`
- `student_memberships` si no se reutiliza `profile_memberships`
- `class_credit_ledger`
- `student_membership_payments`

Agregar en `bookings`:

- `student_id`
- `booked_by_profile_id`
- `active_membership_id`
- metadatos de auditoria

### Fase B - poblar datos actuales

Migracion inicial recomendada:

1. Crear un `student` por cada `profile` actual que represente alumno.
2. Copiar a `students`:
   - nombre
   - avatar
   - fecha de nacimiento si existe
   - grupo
   - distancia
   - flags de arco
3. Si el alumno ya tenia login, asignar `self_profile_id = profiles.id`.
4. Convertir membresia actual de `profiles` o `profile_memberships` en `student_memberships`.
5. Actualizar `bookings.student_id`.
6. Sembrar `class_credit_ledger` con un movimiento inicial `migration_seed`.

### Fase C - nueva lectura

Cambiar frontend y RPCs para leer desde:

- `students`
- `student_memberships`
- `bookings.student_id`

Ya no leer saldo ni vigencia desde `profiles`.

### Fase D - limpieza

Cuando todo el sistema lea bien V2:

- dejar `profiles.membership_type` como legado o eliminarlo
- dejar `profiles.classes_remaining` como legado o eliminarlo
- retirar consultas y hooks que asuman "1 cuenta = 1 alumno"

## Mapeo desde el modelo actual

### Actual

- `profiles` mezcla cuenta y alumno
- `bookings.user_id` apunta a `profiles`
- `profile_memberships` existe, pero sigue sincronizando valores a `profiles`

### Objetivo

- `profiles` = cuenta
- `students` = alumno
- `bookings.student_id` = alumno reservado
- `student_memberships` = contrato real del alumno
- `class_credit_ledger` = movimientos de saldo
- `student_membership_payments` = pagos reales con fechas

## Decisiones recomendadas para implementar ya

1. Mantener `profile_memberships` solo si la tabla ya esta suficientemente cerca de `student_memberships`.
2. Renombrar o recrear `bookings` logicamente alrededor de `student_id`, no de `user_id`.
3. Crear un selector global de alumno para usuarios `guardian`.
4. Hacer que todas las RPCs de alumno validen acceso por `student_id`.

## RPCs nuevas o reescritas

Estas funciones deben pasar al modelo V2:

- `book_session(p_student_id, p_session_id)`
- `cancel_booking(p_booking_id)`
- `get_my_children()`
- `get_student_dashboard(p_student_id)`
- `get_student_memberships(p_student_id)`
- `get_student_booking_history(p_student_id, page, page_size)`
- `get_student_next_booking(p_student_id)`

Todas deben validar que `auth.uid()` tenga permiso sobre ese alumno.

## Riesgos si no se hace este cambio

- no se podra soportar bien padres con varios hijos
- se mezclaran credenciales con datos del alumno
- seguira siendo dificil auditar saldo de clases
- cada nueva funcionalidad obligara a meter excepciones en frontend y SQL

## Conclusiones

La V2 debe girar sobre `students`, no sobre `profiles`.

`profiles` responde a "quien entra al sistema".
`students` responde a "sobre quien existe la operacion academica".

Esa separacion es la base para todo lo demas:

- padres con varios hijos
- alumnos con login propio
- paquetes por alumno
- reservas por alumno
- saldo y vencimiento correctos
- permisos limpios
- pagos con trazabilidad
