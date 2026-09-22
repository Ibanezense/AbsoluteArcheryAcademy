# Intro Week Availability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar en el inicio administrativo la disponibilidad semanal de pruebas de Umacollo de miércoles a viernes y de Tiabaya sábado y domingo.

**Architecture:** Ampliar el RPC administrativo existente para devolver las sesiones habilitadas para pruebas del miércoles al domingo junto con su sede. Normalizar esos campos en el servicio y agrupar dinámicamente las sesiones en la utilidad y el componente del dashboard.

**Tech Stack:** Next.js App Router, React Query, TypeScript, Tailwind CSS, Supabase PostgreSQL, Vitest.

---

### Task 1: Contrato semanal y agrupación

**Files:**
- Modify: `lib/utils/weekendIntroCapacity.test.ts`
- Modify: `lib/utils/weekendIntroCapacity.ts`

**Step 1: Write the failing test**

Agregar casos que esperan miércoles, jueves y viernes de Umacollo, sábado y domingo de Tiabaya, respetando `America/Lima` y sin límites fijos de turnos.

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/utils/weekendIntroCapacity.test.ts`
Expected: FAIL porque los tipos y el agrupador solo aceptan sábado y domingo.

**Step 3: Write minimal implementation**

Extender el tipo de día, los datos de sede y el cálculo de fechas de la semana. Agrupar las sesiones por fecha y sede.

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/utils/weekendIntroCapacity.test.ts`
Expected: PASS.

### Task 2: Consulta y normalización de sede

**Files:**
- Create: `supabase/migrations/20260921190000_admin_intro_week_capacity.sql`
- Modify: `tests/supabase/introSchedulesByLocation.test.ts`
- Modify: `lib/services/adminWeekendIntroCapacityService.test.ts`
- Modify: `lib/services/adminWeekendIntroCapacityService.ts`

**Step 1: Write the failing tests**

Exigir que el RPC consulte miércoles a domingo, incluya sede y filtre Umacollo entre semana y Tiabaya el fin de semana. Exigir que el servicio valide y normalice la sede.

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/supabase/introSchedulesByLocation.test.ts lib/services/adminWeekendIntroCapacityService.test.ts`
Expected: FAIL por ausencia de los nuevos campos y rango.

**Step 3: Write minimal implementation**

Crear una migración idempotente que reemplace el RPC y actualizar la normalización TypeScript.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/supabase/introSchedulesByLocation.test.ts lib/services/adminWeekendIntroCapacityService.test.ts`
Expected: PASS.

### Task 3: Tarjeta semanal del inicio

**Files:**
- Modify: `tests/app/adminWeekendIntroCapacityDashboard.test.ts`
- Modify: `components/admin/WeekendIntroCapacity.tsx`

**Step 1: Write the failing test**

Exigir los cinco días, la sede visible, horarios dinámicos y el texto actualizado.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/adminWeekendIntroCapacityDashboard.test.ts`
Expected: FAIL porque la tarjeta solo renderiza sábado y domingo.

**Step 3: Write minimal implementation**

Renderizar cinco grupos adaptables, indicar la sede y mantener los estados actuales de capacidad.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/app/adminWeekendIntroCapacityDashboard.test.ts`
Expected: PASS.

### Task 4: Verificación e integración

**Files:**
- Verify all modified files.

**Step 1: Run focused tests**

Run: `npm test -- lib/utils/weekendIntroCapacity.test.ts lib/services/adminWeekendIntroCapacityService.test.ts tests/supabase/introSchedulesByLocation.test.ts tests/app/adminWeekendIntroCapacityDashboard.test.ts`
Expected: PASS.

**Step 2: Run full verification**

Run: `npm test && npm run lint && npm run build`
Expected: todos los comandos terminan con código 0.

**Step 3: Review diff and commit**

Confirmar que no se modificaron archivos ajenos y crear un commit convencional enfocado.
