# Sede en turnos manuales Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que cada turno manual se cree y edite asociado explícitamente a Tiabaya o Umacollo.

**Architecture:** El cliente de edición cargará las sedes activas desde Supabase y mantendrá `location_id` en el estado de la sesión. El servicio transaccional recibirá esa sede al guardar, de forma compatible con el flujo existente.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, Vitest.

---

### Task 1: Regresión del formulario

**Files:**
- Create: `tests/app/adminManualSessionLocation.test.ts`
- Test: `app/admin/sesiones/editar/[id]/page.tsx`

**Step 1: Write the failing test**

Comprobar que el formulario importa el acceso a sedes, modela `location_id`, renderiza un selector obligatorio y entrega la sede al guardado.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/adminManualSessionLocation.test.ts`
Expected: FAIL porque el formulario aún no contiene el selector ni el payload de sede.

### Task 2: Implementar sede en la sesión manual

**Files:**
- Modify: `app/admin/sesiones/editar/[id]/page.tsx`
- Inspect/modify if required: `lib/services/adminSessionsService.ts`

**Step 1: Add location state and loading**

Cargar sedes activas, inicializar la sesión nueva sin sede y cargar `location_id` al editar.

**Step 2: Add the required selector**

Mostrar el selector antes del horario, bloquear el guardado sin sede y mostrar la sede en el resumen.

**Step 3: Pass location to the transaction**

Enviar `locationId` al servicio existente y adaptar su firma/RPC únicamente si todavía no lo acepta.

### Task 3: Verify and commit

**Step 1: Run focused tests**

Run: `npx vitest run tests/app/adminManualSessionLocation.test.ts`

**Step 2: Run project checks**

Run: `npm run lint`
Run: `npm run build`

**Step 3: Commit**

```bash
git add docs/plans/2026-09-21-turno-manual-sede-design.md docs/plans/2026-09-21-turno-manual-sede-plan.md
git commit -m "docs: plan manual session locations"
```
