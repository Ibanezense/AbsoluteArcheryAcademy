# Weekend Bow Breakdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar ocupación separada de arcos de 20 lb y 18 lb en cada turno semanal.

**Architecture:** Reemplazar aditivamente el RPC existente para devolver los contadores canónicos ya calculados. Extender tipos y validación del servicio, y renderizar dos chips ocupados/total sin cambiar la regla de disponibilidad.

**Tech Stack:** PostgreSQL/Supabase, TypeScript, React, Tailwind, Vitest.

---

### Task 1: Extender contrato SQL y frontend con TDD

**Files:**
- Create: `supabase/migrations/<generated>_weekend_bow_breakdown.sql`
- Modify: `tests/supabase/adminWeekendIntroCapacity.test.ts`
- Modify: `lib/utils/weekendIntroCapacity.ts`
- Modify: `lib/services/adminWeekendIntroCapacityService.ts`
- Modify: `lib/services/adminWeekendIntroCapacityService.test.ts`
- Modify: `components/admin/WeekendIntroCapacity.tsx`
- Modify: `tests/app/adminWeekendIntroCapacityDashboard.test.ts`

**Steps:**

1. Escribir pruebas fallidas que exijan `academy_capacity`, `academy_bows_used`, `intro_bows_capacity`, `intro_bows_used`, su mapeo y los chips `20 lb`/`18 lb` con formato ocupado/total.
2. Ejecutar las pruebas focalizadas y confirmar RED por campos ausentes.
3. Crear la migración mediante `npx supabase migration new weekend_bow_breakdown`.
4. Reemplazar el RPC manteniendo seguridad y devolver los cuatro campos desde la función canónica (`intro_bows_capacity = 2`).
5. Extender tipo, servicio y validación con enteros no negativos; capacidad usada puede superar capacidad solo para 20 lb por sobrecupo forzado.
6. Renderizar los dos chips solo en turnos reales, con `aria-label` que explique ocupados/total.
7. Ejecutar pruebas focalizadas, suite completa, lint, TypeScript, build y `git diff --check`.
8. Hacer commit, aplicar exclusivamente la nueva migración, verificar lectura administrativa, integrar a `main`, repetir gate, push y verificar Vercel `READY` con el SHA correcto.
