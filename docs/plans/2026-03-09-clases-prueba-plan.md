# Clases Introduccion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar el módulo administrativo para registrar y gestionar clientes de un solo día (Clases de Introducción) impactando el cupo de arcos y los reportes financieros.

**Architecture:** Módulo en Next.js App Router (`/admin/intro`) interactuando con nuevas tablas en Supabase (`intro_clients`, `intro_payments`) y permitiendo IDs foráneos nulos en el campo `user_id` de `bookings` mediante una nueva migración SQL.

**Tech Stack:** Next.js, Supabase SQL/RPC, TailwindCSS.

---

### Task 1: Esquema de Base de Datos para Introductorios

**Files:**
- Create: `supabase/migrations/20260309_create_intro_classes_schema.sql`
- Modify: `supabase_schema.sql` (opcionalmente)

**Step 1: Escribir test (script de validación)**
```sql
-- Verificar que se puedan insertar en bookings sin user_id pero con intro_id
select count(*) from intro_clients;
```

**Step 2: Verificar fallo inicial**
Ejecutar el test y comprobar que la tabla no existe.

**Step 3: Escribir implementación SQL**
```sql
-- 1. Crear tabla de clientes
create table if not exists intro_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  age integer,
  phone text,
  created_at timestamptz default now()
);
alter table intro_clients enable row level security;

-- 2. Crear tabla de pagos
create table if not exists intro_payments (
  id uuid primary key default gen_random_uuid(),
  intro_client_id uuid references intro_clients(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method text not null,
  paid_at timestamptz default now()
);
alter table intro_payments enable row level security;

-- 3. Modificar bookings
alter table bookings add column if not exists intro_client_id uuid references intro_clients(id);
-- Remover restricción not null anterior si la hubiera de facto, pero agregar un check para XOR:
alter table bookings drop constraint if exists bookings_user_or_intro_chk;
alter table bookings add constraint bookings_user_or_intro_chk 
  check (
    (user_id is not null and intro_client_id is null) or 
    (user_id is null and intro_client_id is not null)
  );

-- 4. Modificar RPC admin_mark_attendance (si existe) para tolerar null user_ids si es necesario.
```

**Step 4: Ejecutar en base de datos**
Aplicar en base de datos.

**Step 5: Commit**
```bash
git add supabase/migrations/*
git commit -m "feat(db): schema for intro clients and payments"
```

---

### Task 2: Actualizar el reporte de Finanzas 

**Files:**
- Create: `supabase/migrations/20260309_update_finances_for_intro.sql`

**Step 1: Escribir script de validación**
Extraer datos y verificar unión de queries.

**Step 2: Escribir migración**
Modificar la función `get_finances_report` creada en el fix anterior para que haga un `UNION ALL` con los pagos de la tabla `intro_payments`.

*Extracto:*
```sql
-- ... (código previo del SELECT union all:)
SELECT
  ip.id, ip.paid_at, ic.full_name as student_name,
  'Clase de Prueba' as plan_name,
  ip.amount as base_price,
  ip.amount as amount_paid,
  0 as discount_calculated,
  ip.payment_method, 'paid' as payment_status
FROM intro_payments ip
JOIN intro_clients ic ON ip.intro_client_id = ic.id
WHERE ip.paid_at >= p_start_date AND ip.paid_at < p_end_date
-- ...
```

**Step 3: Commit**
```bash
git add supabase/migrations/*
git commit -m "feat(db): include intro classes in finances report"
```

---

### Task 3: Crear Servicio TS de Clases de Introducción

**Files:**
- Create: `lib/services/IntroClassesService.ts`

**Step 1: Implementar tipos y métodos**
Crear métodos para buscar las reservas futuras (`getUpcomingIntros`), y para agendar una nueva clase (`registerIntroClass` agrupando cliente + pago + booking en un solo llamado o RPC).

**Step 2: Commit**
```bash
git add lib/services/IntroClassesService.ts
git commit -m "feat(service): intro classes management service"
```

---

### Task 4: Crear Interfaz Administrativa (Lista y KPIs)

**Files:**
- Create: `app/admin/intro/page.tsx`
- Create: `app/admin/intro/IntroClient.tsx`
- Modify: `components/AdminSidebar.tsx` (Agregar Link 'intro')
- Modify: `components/AdminBottomNav.tsx` (Agregar Link 'intro')

**Step 1: Implementar Cliente (IntroClient)**
Layout con tabla que muesta Nombre, Edad, Turno Asignado. 

**Step 2: Enlazar navegación**
Añadir el ícono `UsersRound` para diferenciar Pruebas de Alumnos.

**Step 3: Commit**
```bash
git add app/admin/intro/* components/*
git commit -m "feat(ui): intro classes list view and navigation"
```

---

### Task 5: Crear Modal "Todo En Uno" de Registro

**Files:**
- Create: `app/admin/intro/components/RegisterIntroModal.tsx`
- Modify: `app/admin/intro/IntroClient.tsx`

**Step 1: Implementar Formulario**
Campos:
- Datos Personales (Nombre, Edad)
- Selector de Sesiones Futuras (Obtenidas vía SessionService). Importante: Mostrar solo turnos con `capacity > bookings_count`.
- Datos de Pago (Monto S/ , Medio de pago: Plin/Yape/Transferencia).

**Step 2: Integrar envío**
Al hacer submit, invoca `IntroClassesService.registerIntroClass()`, cierra el modal y recarga la tabla.

**Step 3: Commit**
```bash
git commit -am "feat(ui): add all-in-one registration modal for intro classes"
```
