# Facturacion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar una vista administrativa de facturación que muestre ingresos por membresías, cálculos de descuentos y estados de pago filtrables por mes y año.

**Architecture:** Una nueva ruta Next.js bajo `/(dashboard)/finances`. Utilizará Server Actions para obtener datos consolidados desde Supabase y componentes cliente para interactividad (filtrado, exportación a CSV).

**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL RPC / Queries), TailwindCSS, date-fns (o similar para fechas).

---

### Task 1: Crear función RPC en Supabase para obtener transacciones de membresías

**Files:**
- Create: `supabase/migrations/20260309_create_get_finances_report.sql`
- Modify: `supabase_schema.sql` (opcionalmente para reflejar el cambio, pero preferible ejecutar migración).

**Step 1: Escribir test (o script de verificación)**
Como no usamos un framework de tests SQL estricto, escribiremos un script de ejecución segura.
```sql
-- test_get_finances.sql
select * from get_finances_report('2026-03-01', '2026-04-01');
```

**Step 2: Verificar fallo inicial**
Ejecutar intentar llamar a la función (debería fallar por no existir).

**Step 3: Implementación de la función**
```sql
create or replace function get_finances_report(p_start_date date, p_end_date date)
returns table (
  payment_id uuid,
  paid_at timestamptz,
  student_name text,
  plan_name text,
  base_price numeric,
  amount_paid numeric,
  discount_calculated numeric,
  payment_method text,
  payment_status text
)
language plpgsql
security definer
as $$
begin
  -- Verificar que sea admin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'No autorizado';
  end if;

  return query
  select
    p.id,
    p.paid_at,
    s.full_name,
    sm.custom_name,
    coalesce(mp.base_price, 0),
    p.amount,
    coalesce(mp.base_price, 0) - p.amount,
    p.payment_method,
    p.payment_status
  from student_membership_payments p
  join students s on p.student_id = s.id
  join student_memberships sm on p.student_membership_id = sm.id
  left join membership_plans mp on sm.membership_plan_id = mp.id
  where 
    p.paid_at >= p_start_date 
    and p.paid_at < p_end_date
    and p.source != 'migration' -- excluímos migraciones
  order by p.paid_at desc;
end;
$$;
```

**Step 4: Ejecutar en base de datos**
Aplicar mediante comandos DDL.

**Step 5: Commit**
```bash
git add supabase/migrations/*
git commit -m "feat(db): add get_finances_report rpc"
```

---

### Task 2: Crear el servicio de frontend para obtener datos financieros

**Files:**
- Create: `lib/services/FinancesService.ts`

**Step 1: Crear el tipo y mock inicial**
```typescript
// lib/services/FinancesService.ts
export type FinanceRecord = {
  payment_id: string;
  paid_at: string;
  student_name: string;
  plan_name: string;
  base_price: number;
  amount_paid: number;
  discount_calculated: number;
  payment_method: string;
  payment_status: string;
};

export class FinanceService {
  static async getMonthlyReport(startDate: string, endDate: string): Promise<FinanceRecord[]> {
    throw new Error('Not implemented');
  }
}
```

**Step 2: Implementación real conectando a Supabase**
```typescript
import { supabase } from '@/lib/supabase';

//... types
export class FinanceService {
  static async getMonthlyReport(startDate: string, endDate: string): Promise<FinanceRecord[]> {
    const { data, error } = await supabase.rpc('get_finances_report', {
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) {
      console.error("Error fetching finances:", error);
      throw error;
    }

    return data || [];
  }
}
```

**Step 3: Commit**
```bash
git add lib/services/FinancesService.ts
git commit -m "feat(service): add FinancesService to fetch monthly reports"
```

---

### Task 3: Crear la UI de la Página de Finanzas

**Files:**
- Create: `app/(dashboard)/finances/page.tsx`
- Create: `app/(dashboard)/finances/FinancesClient.tsx` (Componente de cliente para menejar el estado de filtros)

**Step 1: Implementar esqueleto de servidor**
```tsx
import FinancesClient from './FinancesClient';
export const metadata = { title: 'Finanzas | Absolute Archery' };

export default function FinancesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finanzas y Facturación</h1>
      <FinancesClient />
    </div>
  );
}
```

**Step 2: Implementar Cliente (Filtros y Tarjetas)**
Implementar componente principal con manejo de estado para el mes y año, tarjetas de KPI (suma ingresos, suma descuentos) y la tabla de resultados.
*Nota para ejecución:* Utilizar componentes de diseño UI modernos (lucide-react icons, tarjetas blancas, sombras sutiles).

**Step 3: Commit**
```bash
git add app/\(dashboard\)/finances/*
git commit -m "feat(ui): implement finances dashboard page and layout"
```

---

### Task 4: Exportación a CSV

**Files:**
- Modify: `app/(dashboard)/finances/FinancesClient.tsx`

**Step 1: Agregar lógica de exportación**
Añadir una función `exportToCsv` que convierta el arreglo de registros de la tabla en un csv usando `Blob` y lo descargue dinámicamente.

**Step 2: Commit final**
```bash
git commit -am "feat(ui): add csv export to finances dashboard"
```
