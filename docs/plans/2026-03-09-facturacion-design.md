# Diseño de la Página de Facturación (Finanzas)

## Objetivo
Crear una página de control financiero para los administradores de la academia, centrada exclusivamente en los ingresos provenientes de las membresías de los alumnos regulares. Se debe permitir el desglose por mes y año. Por el momento, las "clases de prueba" quedan excluidas de este alcance.

## Estructura de la Interfaz (Opción A Adaptada)

**Ubicación:** `/app/(dashboard)/finances/page.tsx` (o similar, dentro del área protegida para admins).

### 1. Cabecera Global
- **Título:** "Control Financiero" o "Facturación".
- **Filtros de Tiempo:**
  - Selector de Año (ej: 2024, 2025, 2026).
  - Selector de Mes (Enero - Diciembre).
  - *Valor por defecto:* Mes y año actuales.
- **Acciones:**
  - Botón: "Exportar a CSV" (descarga los datos de la tabla que se está visualizando).

### 2. Tarjetas de Resumen (KPIs del mes seleccionado)
- **Ingresos Totales:** Suma de todos los pagos de membresías (`amount`) donde `payment_status = 'paid'` en el mes seleccionado.
- **Descuentos Otorgados:** Suma de la diferencia entre el precio base del plan (`membership_plans.base_price`) y lo cobrado (`student_membership_payments.amount`) para los pagos del mes.
- **Pagos Pendientes / Atrasados:** Suma o conteo de pagos con `payment_status IN ('pending', 'late')` cuya `due_date` caiga en el mes seleccionado.

### 3. Detalle de Ingresos (Tabla Principal)
Una tabla de datos para visualizar cada pago individual registrado en el sistema durante el mes seleccionado.
- **Columnas:**
  - Fecha de Pago (`paid_at` formateada).
  - Alumno (Nombre de `students.full_name`).
  - Plan / Concepto (Nombre de `membership_plans.name` o `student_memberships.custom_name` si difiere).
  - Precio Base (Del plan asociado).
  - Descuento (Calculado: Precio Base - Monto Pagado).
  - Total Pagado (`student_membership_payments.amount`).
  - Método de Pago (`payment_method`).
- **Paginación / Scroll:** Integrada si los registros mensuales exceden ~20-50 filas.

## Origen de Datos (Supabase V2)

Para poblar esta vista, se necesitará interactuar con las siguientes tablas:
- `student_membership_payments`: Tabla base para los ingresos (monto, fecha, método, estado). Cruzada por `paid_at` (o `due_date` para pendientes).
- `student_memberships`: Para entender el contexto del pago (qué se vendió).
- `membership_plans`: Para obtener el precio base (`base_price`) y calcular el descuento.
- `students`: Para mostrar el nombre del cliente.

**Consulta SQL/RPC sugerida (o cruce via postgREST):**
```sql
SELECT
  p.id as payment_id,
  p.paid_at,
  s.full_name as student_name,
  sm.custom_name as plan_name,
  mp.base_price,
  p.amount as amount_paid,
  (mp.base_price - p.amount) as discount_calculated,
  p.payment_method,
  p.payment_status
FROM student_membership_payments p
JOIN students s ON p.student_id = s.id
JOIN student_memberships sm ON p.student_membership_id = sm.id
LEFT JOIN membership_plans mp ON sm.membership_plan_id = mp.id
WHERE 
  p.payment_status = 'paid' 
  AND p.paid_at >= '[INICIO_MES]' AND p.paid_at < '[INICIO_SIGUIENTE_MES]'
ORDER BY p.paid_at DESC;
```

## Manejo de Descuentos
- El descuento no es un campo en base de datos; es una lógica computada en el frontend (o backend via query).
- Cálculo: `Descuento = Precio Base del Plan - Monto Pagado Real`.
- *Caso borde:* Si el monto pagado es `$0` por "migration" (como figuraba en los JSON revisados), se considera descontado el 100% o se puede filtrar omitiendo `source = 'migration'` si solo se quiere ver _cash_ real.
  - *Decisión recomendada:* Excluir pagos migrados (`source = 'migration'`) del cálculo de ingresos y descuentos del mes cursante.
