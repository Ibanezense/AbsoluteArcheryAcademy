# Diseño de la Página de Clases de Introducción (Prueba)

## Objetivo
Crear una sección administrativa exclusiva para gestionar los clientes que toman una única "Clase de Prueba" o "Clase de Introducción". Estos clientes reservan un cupo de arco y asistencia, pagan de manera anticipada por fuera de la web (transferencia/efectivo), pero su información no debe mezclarse con la base de datos de los alumnos regulares del sistema ni ensuciar las estadísticas orgánicas. Asimismo, estos ingresos deben impactar en Finanzas.

## Estructura de la Base de Datos

Se opta por la separación estricta para garantizar escalabilidad (Opción B del análisis):

1. **Tabla de Clientes de Prueba (`intro_clients`):**
   - `id`: UUID (Primary Key).
   - `full_name`: Text.
   - `age`: Integer.
   - `created_at`: Timestamp.

2. **Modificación de Reservas (`bookings`):**
   - Alterar la tabla `bookings` para que `user_id` permita NULL **SI Y SÓLO SI** la nueva columna `intro_client_id` (UUID references `intro_clients`) NO es nula.
   - Restricción: Un booking debe tener o bien un `user_id` o bien un `intro_client_id`. Nunca ambos nulos, nunca ambos llenos.
   - *(Comportamiento derivado)*: Al ser insertado en `bookings`, el mecanismo actual del sistema ya restará 1 al contador de capacidad (`capacity`) del turno (`sessions`) protegiendo el inventario físico de arcos.

3. **Registro Financiero (`intro_payments` o adaptación en `Finanzas`):**
   - Dado que ya se manejan los pagos manuales de membresías, optaremos por una expansión/registro directo en una tabla paralela `intro_payments` para registrar el monto manual que el cliente pagó por transfer o efectivo.
   - Columnas de `intro_payments`: `intro_client_id`, `amount`, `payment_method` (ej: 'transferencia', 'efectivo', 'yape'), `paid_at`.

## Estructura de la UI (Opción A - Estandarizada)

**Ubicación:** `/app/admin/intro/page.tsx`
(Ruta agregada consecuentemente al `AdminSidebar` y `AdminBottomNav`).

### 1. Cabecera y Resumen
- **Título:** "Clases de Introducción"
- **Acciones:** Botón "+ Ingresar nueva clase".
- **KPIs (Tarjetas estandarizadas como en Alumnos):**
  - "Pruebas en este Mes" (Conteo).
  - "Ingresos por Pruebas" (Suma en `S/`).
  - "Pruebas Próximos 7 Días".

### 2. Tabla Principal
Visualmente parecida a tu lista de `/admin/alumnos`, mostrando:
- Fecha y Hora Reservada (de la reserva / turno, extrayendo de `sessions`).
- Nombre Completo.
- Edad.
- Estado de la sesión (Pasada / Próxima).

### 3. Modal de "Nueva Clase" (Todo-en-Uno)
Abre un formulario completo para registrar manualmente todo en base al comprobante recibido por Whatsapp/correo.
Flujo en el frontend:
1. **Datos:** Input para "Nombre Completo" e "Edad".
2. **Reserva:** Un selector (dropdown/radio) para ver los turnos (`sessions`) de los próximos 7/14 días que **aún tengan cupo disponible**.
3. **Pago:** Input para el Monto Pagado (ej: `S/30.00`) y Método (Yape, Plin, Efectivo, BCP).
4. **Submit:** El `Server Action` transaccional insertará silenciosamente:
   - Crear registro en `intro_clients`.
   - Crear registro en `intro_payments` asociado al id.
   - Crear registro en `bookings` con el `session_id` elegido y el `intro_client_id`.

## Suposiciones Aclaradas
- No hay integración con pasarelas de "Stripe/Niubiz". Todo es manual y reportado por el admin que vio la transferencia.
- La "membresía de 1 día" para estos clientes es netamente conceptual, no insertamos en la tabla `membership_plans` ni `student_memberships`. Su sola existencia en la tabla `intro_payments` justifica su facturación, y su existencia en `bookings` vinculada a `intro_clients` justifica su derecho de asistencia a un turno y su uso del arco.

## Próximos Pasos de Implementación
1. Crear plan técnico desglosado (SQL migrations para `intro_clients`, ALTER de `bookings`).
2. Implementar Servicios TS para obtener y centralizar los turnos disponibles y crear clientes.
3. Crear Views y Componentes del Admin.
4. Conectar al dashboard de Finanzas para sumar el ingreso de prueba allí también (modificando la query de finanzas).
