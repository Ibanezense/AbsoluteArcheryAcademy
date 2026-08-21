# Bulk Membership Expiry Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an audited admin action that extends exactly seven days on the latest eligible membership of every affected student.

**Architecture:** Two admin-only Supabase RPCs own eligibility and ordering: one returns a read-only preview and one reselects, locks, and updates the same targets atomically. A small TypeScript service normalizes their JSON results, while a dedicated modal on the memberships page collects the reason, shows the preview, confirms the operation, and invalidates every affected cache after success.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, TanStack Query, Supabase/Postgres PL/pgSQL, Vitest, Tailwind CSS.

---

### Task 1: Specify the database contract with a failing test

**Files:**
- Create: `tests/supabase/adminBulkMembershipExpiryExtension.test.ts`
- Create (already generated with Supabase CLI): `supabase/migrations/20260821234317_bulk_membership_expiry_extension.sql`

**Step 1: Write the failing migration test**

Read the generated migration and assert that it defines:

- `admin_preview_bulk_membership_expiry_extension()`;
- `admin_apply_bulk_membership_expiry_extension(text, uuid)`;
- fixed Lima date and `end_date + 7` behavior;
- eligibility predicates `status = 'active'`, `classes_remaining > 0`, non-null `end_date`, and `end_date >= today`;
- `DISTINCT ON (student_id)` ordered by `student_id`, `start_date DESC`, `created_at DESC`, `id DESC`;
- a persistent idempotency batch keyed by UUID;
- explicit admin checks, fixed `search_path`, revoked `PUBLIC`/`anon`, and grants only to `authenticated`/`service_role`;
- no writes to class, payment, amount, origin, or start-date columns.

**Step 2: Run the test and verify RED**

Run: `npm test -- tests/supabase/adminBulkMembershipExpiryExtension.test.ts`

Expected: FAIL because the generated migration is empty.

**Step 3: Commit the failing contract**

```powershell
git add -- tests/supabase/adminBulkMembershipExpiryExtension.test.ts supabase/migrations/20260821234317_bulk_membership_expiry_extension.sql
git commit -m "test(memberships): specify bulk expiry extension"
```

### Task 2: Implement the atomic preview and apply RPCs

**Files:**
- Modify: `supabase/migrations/20260821234317_bulk_membership_expiry_extension.sql`
- Test: `tests/supabase/adminBulkMembershipExpiryExtension.test.ts`

**Step 1: Add the idempotency batch table**

Create `public.membership_expiry_extension_batches` with UUID primary key, actor profile, required reason, fixed `extension_days = 7`, affected count, JSON result, and creation timestamp. Enable RLS, allow only admins to read, and prevent direct client writes.

**Step 2: Add the preview RPC**

Return JSON shaped as:

```json
{
  "affected_count": 2,
  "extensions": [
    {
      "student_id": "...",
      "student_name": "Alumno",
      "membership_id": "...",
      "membership_name": "Plan",
      "current_end_date": "2026-08-31",
      "new_end_date": "2026-09-07"
    }
  ]
}
```

Select one row per student with `DISTINCT ON`, using the approved eligibility and stable descending order.

**Step 3: Add the apply RPC**

Reject empty reasons and unauthenticated/non-admin callers. Insert the idempotency batch first; on conflict, return the stored result with `already_applied: true`. For a new batch, reselect targets, lock them, update only `end_date` and `updated_at`, record the final JSON result, and log one batch audit event through `log_admin_action` in addition to the existing per-membership update trigger.

**Step 4: Restrict function execution**

Use `SECURITY DEFINER SET search_path = public`, revoke from `PUBLIC` and `anon`, then grant to `authenticated` and `service_role`.

**Step 5: Run the migration test and verify GREEN**

Run: `npm test -- tests/supabase/adminBulkMembershipExpiryExtension.test.ts`

Expected: PASS.

**Step 6: Commit the database implementation**

```powershell
git add -- supabase/migrations/20260821234317_bulk_membership_expiry_extension.sql tests/supabase/adminBulkMembershipExpiryExtension.test.ts
git commit -m "feat(memberships): add bulk expiry extension RPCs"
```

### Task 3: Add a typed client service

**Files:**
- Create: `lib/services/adminMembershipExpiryExtensionService.ts`
- Create: `lib/services/adminMembershipExpiryExtensionService.test.ts`

**Step 1: Write failing service tests**

Use a fake RPC client and assert that:

- preview calls `admin_preview_bulk_membership_expiry_extension` without parameters;
- apply trims and sends `p_reason` plus `p_idempotency_key`;
- malformed/null RPC data is normalized to zero extensions;
- Supabase errors become clear Spanish `Error` messages.

**Step 2: Run the service test and verify RED**

Run: `npm test -- lib/services/adminMembershipExpiryExtensionService.test.ts`

Expected: FAIL because the service does not exist.

**Step 3: Implement the minimal typed service**

Export `MembershipExpiryExtension`, `MembershipExpiryExtensionPreview`, `previewBulkMembershipExpiryExtension`, and `applyBulkMembershipExpiryExtension`. Keep the two accepted RPC function names explicit in the client type.

**Step 4: Run the service test and verify GREEN**

Run: `npm test -- lib/services/adminMembershipExpiryExtensionService.test.ts`

Expected: PASS.

**Step 5: Commit the service**

```powershell
git add -- lib/services/adminMembershipExpiryExtensionService.ts lib/services/adminMembershipExpiryExtensionService.test.ts
git commit -m "feat(memberships): add expiry extension service"
```

### Task 4: Add the admin modal and page integration

**Files:**
- Create: `components/admin/MembershipExpiryExtensionModal.tsx`
- Modify: `app/admin/membresias/page.tsx`
- Create: `tests/app/adminBulkMembershipExpiryExtension.test.ts`

**Step 1: Write failing UI and integration tests**

Render the modal to static markup and verify the fixed seven-day explanation, affected count, reason field, empty-state behavior, cancel action, and disabled confirmation when there are no targets or the reason is blank. Inspect the page source to verify the header button, preview/apply service calls, UUID idempotency key, success/error toast, pending guard, and invalidation of `membershipPlanKeys.all`, `studentKeys.all`, `membershipRenewalAlertKeys.all`, `admin-students`, `admin-bookings`, and `weekly-attendance-review`.

**Step 2: Run the UI test and verify RED**

Run: `npm test -- tests/app/adminBulkMembershipExpiryExtension.test.ts`

Expected: FAIL because the modal and integration are absent.

**Step 3: Implement the modal**

Use the existing visual system and dialog patterns. Show the exact fixed operation, preview list with old/new dates, required reason textarea, `Cancelar`, and `Aplicar retraso de 7 días`. Preserve accessible labels, focusable controls, mobile layout, and `aria-busy` while applying.

**Step 4: Integrate the page flow**

Add **Retrasar vencimientos 7 días** beside **Nueva venta o renovación**. Load the preview when opening, keep one idempotency UUID for the pending operation, require confirmation through the existing confirm provider, call apply once, show the actual affected count, reset modal state, invalidate all affected query families, and call `refreshAll()`.

**Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/app/adminBulkMembershipExpiryExtension.test.ts lib/services/adminMembershipExpiryExtensionService.test.ts tests/supabase/adminBulkMembershipExpiryExtension.test.ts`

Expected: PASS.

**Step 6: Commit the UI**

```powershell
git add -- components/admin/MembershipExpiryExtensionModal.tsx app/admin/membresias/page.tsx tests/app/adminBulkMembershipExpiryExtension.test.ts
git commit -m "feat(admin): add bulk membership expiry action"
```

### Task 5: Verify and apply the Supabase migration

**Files:**
- Verify: `supabase/migrations/20260821234317_bulk_membership_expiry_extension.sql`

**Step 1: Inspect linked project and migration history**

Run `npx supabase --help`, the relevant `migration list --help`, and `db push --help` commands before choosing flags. Confirm `.env.local`, the linked project reference, and that local/remote migration histories are aligned. Do not repair history or use `--include-all` without explicit reconciliation.

**Step 2: Run the full local gate before database writes**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, and `npm run build` where the verified environment is available.

Expected: all commands exit 0.

**Step 3: Apply the single migration**

Use the discovered supported Supabase CLI/MCP workflow to apply only `20260821234317_bulk_membership_expiry_extension.sql` to the confirmed production project.

**Step 4: Verify live behavior without modifying memberships**

Call only the preview RPC as an authenticated admin or run safe read-only SQL that reproduces its target selection. Confirm the function exists, permissions are restricted, the batch table has RLS, and the preview excludes expired rows while choosing one latest candidate per student. Do not call the apply RPC with production memberships for testing.

### Task 6: Review, merge, deploy, and verify production

**Files:**
- Review all commits and changed files.

**Step 1: Run final verification**

Run: `git diff main...HEAD --check`, `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, and `npm run build` with the verified main environment.

Expected: clean diff and all checks pass.

**Step 2: Merge and push**

Fast-forward `main`, rerun the complete gate on the merged result, and push `main` to `origin`.

**Step 3: Verify Vercel**

Wait for the deployment whose Git SHA equals the merged commit. Require production status `READY`, the expected aliases, and HTTP 200 from `https://absolute-archery-academy.vercel.app`.

**Step 4: Clean up**

Remove the integrated worktree and delete the merged feature branch. Report the commit, migration, verification totals, deployment URL, and any warnings that were not introduced by this change.
