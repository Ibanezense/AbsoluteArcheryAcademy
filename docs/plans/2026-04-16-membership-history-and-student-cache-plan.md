# Membership History And Student Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make each new membership start a clean active cycle while preserving the previous membership as history, and refresh admin student data immediately after edits.

**Architecture:** Replace the latest accumulation-based membership assignment RPC with a new migration that closes the previous active membership and inserts a brand-new active row. In the admin student editor, invalidate React Query caches after a successful save so both the current screen and shared lists update immediately.

**Tech Stack:** Supabase SQL migrations, consolidated SQL snapshot, Next.js, React, React Query, Vitest, ESLint

---

### Task 1: Add failing regression tests

**Files:**
- Modify: `tests/supabase/adminAssignMembershipPlan.test.ts`
- Create: `tests/app/adminAlumnoEditorCacheInvalidation.test.ts`

**Step 1: Write the failing membership regression**

Point the SQL test to a new migration and require:

- previous active memberships are updated to `historical`
- a new active membership row is inserted
- the insert starts with `classes_total = v_plan.classes_included`
- the insert starts with `classes_remaining = v_plan.classes_included`
- no accumulation from `v_active_membership.classes_total` or `classes_remaining`

**Step 2: Write the failing editor cache regression**

Read `app/admin/alumnos/editar/[id]/page.tsx` and require:

- `useQueryClient` is imported
- `studentKeys` is imported
- `invalidateQueries({ queryKey: studentKeys.all })` is present
- `invalidateQueries({ queryKey: studentKeys.detail(id) })` is present

**Step 3: Run the tests and verify they fail**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run tests/supabase/adminAssignMembershipPlan.test.ts tests/app/adminAlumnoEditorCacheInvalidation.test.ts"
```

Expected: FAIL

### Task 2: Restore fresh-membership assignment behavior

**Files:**
- Create: `supabase/migrations/20260416_100000_restore_new_membership_cycles.sql`
- Modify: `supabase/consolidated_from_scratch.sql`
- Modify: `app/admin/membresias/page.tsx`

**Step 1: Override `admin_assign_membership_plan(...)`**

Implement the RPC so it:

- marks any current active membership for the student as `historical`
- inserts a brand-new active membership row
- sets `classes_total = v_plan.classes_included`
- sets `classes_used = 0`
- sets `classes_remaining = v_plan.classes_included`
- leaves previous bookings attached to the historical membership

**Step 2: Keep payment and ledger registration on the new row**

The new active membership should receive the activation ledger entry and optional payment record.

**Step 3: Update admin copy**

Explain that creating a new membership moves the previous one to history and starts a fresh set of classes.

### Task 3: Refresh student caches after save

**Files:**
- Modify: `app/admin/alumnos/editar/[id]/page.tsx`

**Step 1: Add query client invalidation**

After a successful save:

- invalidate `studentKeys.all`
- invalidate `studentKeys.detail(id)` for edits
- still refetch the current detail query for immediate screen consistency

**Step 2: Preserve create flow**

For new students, invalidate the student list before redirecting to the new detail page.

### Task 4: Verification

**Files:**
- Verify: `tests/supabase/adminAssignMembershipPlan.test.ts`
- Verify: `tests/app/adminAlumnoEditorCacheInvalidation.test.ts`
- Verify: touched SQL and editor files

**Step 1: Run focused tests**

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run tests/supabase/adminAssignMembershipPlan.test.ts tests/app/adminAlumnoEditorCacheInvalidation.test.ts"
```

Expected: PASS

**Step 2: Run lint**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: no new errors
