# Membership Renewal Accumulation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make membership renewals add new credits onto the current active membership instead of replacing pending credits.

**Architecture:** Keep the existing one-active-membership model, but change `admin_assign_membership_plan(...)` so it updates the active membership row when one exists. That preserves booking references and refund behavior while making the renewal visible through ledger, payment history, and admin UI text.

**Tech Stack:** Supabase SQL migrations, consolidated SQL snapshot, Next.js, React, TypeScript, Vitest, ESLint

---

### Task 1: Add the failing regression test

**Files:**
- Create: `tests/supabase/adminAssignMembershipPlan.test.ts`

**Step 1: Write the failing test**

Create a focused test that reads the new renewal migration and asserts that it:

- loads an active membership into a variable
- updates that row instead of marking it historical
- adds `classes_included` into `classes_total` and `classes_remaining`
- records a `membership_renewal` ledger entry

**Step 2: Run the test to verify it fails**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run tests/supabase/adminAssignMembershipPlan.test.ts"
```

Expected: FAIL because the migration does not exist yet.

### Task 2: Update the renewal RPC

**Files:**
- Create: `supabase/migrations/20260401_120000_accumulate_active_membership_renewals.sql`
- Modify: `supabase/consolidated_from_scratch.sql`

**Step 1: Rework `admin_assign_membership_plan(...)`**

When an active membership exists for the student:

- `SELECT ... FOR UPDATE` the active row
- update the same row
- add the new plan credits onto `classes_total` and `classes_remaining`
- keep the membership active
- extend `end_date` without shortening it
- insert a `membership_renewal` ledger entry
- insert the optional payment against the same membership id

When no active membership exists, keep the current insert path.

**Step 2: Allow the new ledger movement type**

Extend the ledger `movement_type` check to include:

```sql
'membership_renewal'
```

**Step 3: Run the regression test to verify it passes**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run tests/supabase/adminAssignMembershipPlan.test.ts"
```

Expected: PASS

### Task 3: Align admin UI copy and recent activity ordering

**Files:**
- Modify: `app/admin/membresias/page.tsx`
- Modify: `lib/hooks/useMembershipPlans.ts`

**Step 1: Update renewal copy**

Replace the text that says the previous active membership becomes historical with copy that explains active balances accumulate on renewal.

**Step 2: Surface renewed memberships as recent activity**

Order recent memberships by `updated_at desc` and include `updated_at` in the selected fields.

**Step 3: Run lint on touched files**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: no new lint errors in the touched files.

### Task 4: Final verification

**Files:**
- Verify: `tests/supabase/adminAssignMembershipPlan.test.ts`
- Verify: `app/admin/membresias/page.tsx`
- Verify: `lib/hooks/useMembershipPlans.ts`
- Verify: `supabase/migrations/20260401_120000_accumulate_active_membership_renewals.sql`
- Verify: `supabase/consolidated_from_scratch.sql`

**Step 1: Run the focused regression test**

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run tests/supabase/adminAssignMembershipPlan.test.ts"
```

Expected: PASS

**Step 2: Run lint**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: no new lint errors caused by this change

**Step 3: Manual verification**

Check in admin:

1. Renew a student with an active membership.
2. Confirm the same membership keeps the booked classes.
3. Confirm `classes_remaining` increases instead of resetting.
4. Confirm the renewal still appears in the recent memberships panel.
