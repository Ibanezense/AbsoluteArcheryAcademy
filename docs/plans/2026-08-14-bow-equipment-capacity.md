# Equipment-Based Booking Capacity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace target-based booking limits with a shared equipment rule: unlimited own/assigned bows, six configurable 20 lb academy bows, and two separate trial bows before trials consume academy inventory.

**Architecture:** Add one canonical PostgreSQL equipment-availability helper and redefine every booking/read RPC that currently derives capacity from targets. Keep the existing return shapes for frontend compatibility, move intro-session availability into an RPC, and update visible copy to describe equipment rather than target slots.

**Tech Stack:** Next.js 14, TypeScript, React, Supabase/PostgreSQL PL/pgSQL, Vitest, Vercel.

---

### Task 1: Define the capacity contract with failing tests

**Files:**
- Create: `tests/supabase/equipmentBasedCapacity.test.ts`
- Modify: `tests/supabase/atomicIntroAndSessionRpcs.test.ts`
- Modify: `tests/app/studentMobileRedesign.test.ts`
- Modify: `tests/app/adminQuickBookingRedesign.test.ts`

**Step 1: Write failing SQL contract tests**

Test that the new migration:

- creates `get_session_equipment_availability(uuid, uuid)`;
- counts regular academy bookings separately from intro bookings;
- reserves the first two intro bookings outside academy inventory;
- uses `GREATEST(v_intro_reserved - 2, 0)` for academy consumption;
- uses the 20 lb `bow_inventory.quantity_active` value;
- redefines `check_session_availability_v3`, `get_available_sessions_for_student`, `admin_register_intro_class`, `admin_update_intro_class`, and a new intro-availability RPC;
- excludes `slot_capacity`, `targets * 4`, distance-capacity rejection, and distance reservation limits from executable capacity decisions;
- locks the session before final checks in all write RPCs;
- revokes execution from `PUBLIC` and `anon` for privileged functions.

**Step 2: Write failing UI/source tests**

Assert that student and admin surfaces use equipment wording and contain the exact exhaustion message:

```text
Para este turno ya no tenemos equipo disponible. Por favor, reserva otro turno disponible.
```

Assert that `IntroClassesService.getAvailableSessions` calls the new RPC instead of calculating `targets * 4` in the browser.

**Step 3: Run focused tests and confirm RED**

Run:

```powershell
npx vitest run tests/supabase/equipmentBasedCapacity.test.ts tests/supabase/atomicIntroAndSessionRpcs.test.ts tests/app/studentMobileRedesign.test.ts tests/app/adminQuickBookingRedesign.test.ts lib/services/IntroClassesService.test.ts
```

Expected: failures because the migration and equipment copy do not exist.

**Step 4: Commit the failing contract**

```powershell
git add tests/supabase/equipmentBasedCapacity.test.ts tests/supabase/atomicIntroAndSessionRpcs.test.ts tests/app/studentMobileRedesign.test.ts tests/app/adminQuickBookingRedesign.test.ts lib/services/IntroClassesService.test.ts
git commit -m "test(bookings): define equipment capacity contract"
```

### Task 2: Add the canonical Supabase equipment rule

**Files:**
- Create with CLI: `supabase/migrations/<generated_timestamp>_equipment_based_booking_capacity.sql`
- Test: `tests/supabase/equipmentBasedCapacity.test.ts`

**Step 1: Generate the migration through Supabase CLI**

Run:

```powershell
npx supabase migration new equipment_based_booking_capacity
```

Use the exact emitted path for the remaining steps; do not rename or invent a timestamp.

**Step 2: Seed the approved configurable inventory**

Upsert the 20 lb row so `quantity_active = 6` and `quantity_total` is at least 6. Do not create a table or hardcode six in every consumer.

**Step 3: Implement the canonical helper**

Create `public.get_session_equipment_availability(p_session_id uuid, p_exclude_booking_id uuid DEFAULT NULL)` returning JSON with:

```text
academy_capacity
academy_students_reserved
intro_reserved
intro_bows_used
intro_academy_bows_used
academy_bows_used
academy_bows_remaining
intro_spots_remaining
```

Use only `bookings.status = 'reserved'`. Count regular academy students where `student_id IS NOT NULL`, `intro_client_id IS NULL`, and `bow_usage_type = 'shared_inventory'`. Count trials where `intro_client_id IS NOT NULL`. Exclude the supplied booking during intro edits.

**Step 4: Redefine student availability**

`check_session_availability_v3` must:

- return available immediately for `own` and `assigned` after validating student/session;
- never require a distance allocation;
- for `shared_inventory`, return `academy_bows_remaining` as `spots_for_student`;
- return the approved Spanish equipment message at zero.

`get_available_sessions_for_student` must return all eligible sessions for own/assigned equipment and compute shared-inventory spots through the canonical helper. Preserve the current table signature so existing callers remain compatible.

**Step 5: Redefine intro writes and reads**

- `admin_register_intro_class`: lock the session, compute `intro_spots_remaining`, reject zero, then insert.
- `admin_update_intro_class`: lock the target session, compute availability excluding the edited booking, reject zero, then update.
- `get_available_intro_sessions(date, date)`: return scheduled sessions with total intro availability equal to unused trial bows plus remaining academy bows.

**Step 6: Secure the functions**

Keep fixed `search_path`, explicit authentication/admin checks on privileged RPCs, revoke `PUBLIC` and `anon`, and grant only required roles.

**Step 7: Run focused tests and confirm GREEN**

Run the Task 1 focused command. Expected: all pass.

**Step 8: Commit**

```powershell
git add supabase/migrations tests/supabase
git commit -m "feat(bookings): enforce equipment-based capacity"
```

### Task 3: Move intro availability to the database

**Files:**
- Modify: `lib/services/IntroClassesService.ts`
- Modify: `lib/services/IntroClassesService.test.ts`

**Step 1: Extend the failing service test**

Assert that `getAvailableSessions` calls `get_available_intro_sessions` with a date range and maps `equipment_capacity`, `equipment_reserved`, and `spots_remaining` to the existing `AvailableIntroSession` model.

**Step 2: Run service test and confirm RED**

```powershell
npx vitest run lib/services/IntroClassesService.test.ts
```

**Step 3: Implement the RPC-backed read**

Remove the direct `sessions`, allocation, and booking-count calculation. Call the new RPC and preserve the service’s public return type.

**Step 4: Run service test and confirm GREEN**

```powershell
npx vitest run lib/services/IntroClassesService.test.ts
```

**Step 5: Commit**

```powershell
git add lib/services/IntroClassesService.ts lib/services/IntroClassesService.test.ts
git commit -m "fix(intro): share equipment availability rule"
```

### Task 4: Update student and admin capacity messaging

**Files:**
- Modify: `components/ui/ClassCardsBoard.tsx`
- Modify: `app/reservar/page.tsx`
- Modify: `app/reserva/[id]/editar/page.tsx`
- Modify: `components/AdminQuickBooking.tsx`
- Test: `tests/app/studentMobileRedesign.test.ts`
- Test: `tests/app/adminQuickBookingRedesign.test.ts`

**Step 1: Update visible labels**

- Use `equipos disponibles` for shared inventory.
- Use `Equipo propio` or `Equipo asignado · disponibilidad libre` for unlimited types.
- Replace `sin cupos` with `sin equipo disponible` where the limitation is equipment.
- Keep the exact exhaustion message available to toast/error rendering.
- Remove display dependence on `distance_reserved / slot_capacity` from quick booking.

**Step 2: Run UI source tests**

```powershell
npx vitest run tests/app/studentMobileRedesign.test.ts tests/app/adminQuickBookingRedesign.test.ts
```

Expected: all pass.

**Step 3: Commit**

```powershell
git add components/ui/ClassCardsBoard.tsx app/reservar/page.tsx app/reserva/[id]/editar/page.tsx components/AdminQuickBooking.tsx tests/app
git commit -m "fix(bookings): show equipment availability"
```

### Task 5: Verify and apply Supabase migration

**Files:**
- Verify: generated equipment migration

**Step 1: Run the full local gate**

```powershell
npm test -- --run
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: 0 failures and successful production build.

**Step 2: Dry-run the complete SQL transaction**

Temporarily end the generated migration with `ROLLBACK`, execute it through `npx supabase db query --linked --file <path>`, and restore `COMMIT`. Expected: PostgreSQL accepts all definitions and persists nothing.

**Step 3: Apply the migration**

Execute only the generated migration file directly because this repository has known remote/local history drift. Do not use a blind `supabase db push`.

**Step 4: Verify live database behavior**

Use aggregate-only SQL checks to prove:

- 20 lb active inventory is 6;
- two trial reservations consume zero academy bows;
- the third consumes one;
- own/assigned functions contain no target-capacity gate;
- all expected RPCs and grants exist;
- the exact error message is deployed.

**Step 5: Run database advisors**

Run `npx supabase db advisors --linked` if supported; otherwise record the CLI limitation and inspect function security/grants directly.

### Task 6: Integrate, push, deploy, and verify production

**Files:**
- No new application files.

**Step 1: Review the branch**

Inspect `git diff main...HEAD`, confirm only scoped changes, and re-run the full gate if any review correction is made.

**Step 2: Fast-forward main**

Verify the main checkout is clean, fetch origin, and merge `codex/bow-equipment-capacity` with `--ff-only`.

**Step 3: Verify main and push**

Run the full gate from `main`, then push `origin main` only if clean and green.

**Step 4: Verify Vercel production**

Wait for the Git-triggered production deployment to reach `READY`. Verify `/`, `/login`, `/admin/intro`, `/admin/alumnos`, and `/reservar` return HTTP 200.

**Step 5: Runtime completion audit**

Confirm the deployed database definitions, production deployment ID, alias, Git SHA equality, and clean `main`. Report any authenticated browser scenario that could not be exercised without credentials instead of claiming it passed.
