# Corrective Membership Deletion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow an administrator to safely edit or delete a mistakenly entered membership, deleting its linked payments, credit movements, and reservations only when it has no attendance or no-show history.

**Architecture:** Extend the effective multiple-membership migration with an admin-only preview RPC and a transactional delete RPC. The UI requests the preview before confirmation, displays the affected counts, then performs the deletion through the protected RPC and invalidates every affected React Query surface.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, TanStack Query, Supabase/PostgreSQL PL/pgSQL, Vitest, Tailwind CSS, Vercel.

---

### Task 1: Define the SQL deletion contract

**Files:**
- Modify: `tests/supabase/multipleActiveMemberships.test.ts`
- Modify: `tests/supabase/adminDeleteExpiredMemberships.test.ts`

**Step 1: Write the failing tests**

Add contract assertions proving the effective migration:

- defines `admin_get_membership_deletion_preview(uuid)` and `admin_delete_student_membership(uuid)`;
- checks `auth.uid()` and `is_admin_user()`;
- fixes `search_path` and revokes `PUBLIC`/`anon` execution;
- locks the membership and linked bookings;
- blocks when a linked booking is `attended` or `no_show`;
- blocks when `student_weekly_attendance` references the membership;
- allows every membership status when no attendance exists;
- deletes linked bookings, payments, ledger rows, then the membership;
- synchronizes the student's operational membership state;
- returns affected-row counts.

Update the legacy deletion test so it documents that the historical migration is superseded rather than asserting the effective behavior.

**Step 2: Run tests to verify RED**

Run:

```powershell
npx vitest run tests/supabase/multipleActiveMemberships.test.ts tests/supabase/adminDeleteExpiredMemberships.test.ts
```

Expected: FAIL because the latest migration does not redefine the preview/delete RPCs.

**Step 3: Commit the red contract**

```powershell
git add tests/supabase/multipleActiveMemberships.test.ts tests/supabase/adminDeleteExpiredMemberships.test.ts
git commit -m "test(memberships): define corrective deletion contract"
```

### Task 2: Implement protected transactional deletion

**Files:**
- Modify: `supabase/migrations/20260801_190000_multiple_active_student_memberships.sql`
- Test: `tests/supabase/multipleActiveMemberships.test.ts`

**Step 1: Implement preview RPC**

Append `admin_get_membership_deletion_preview(p_membership_id uuid) RETURNS jsonb` with:

- authenticated admin validation;
- membership existence validation;
- counts for linked bookings, payments, and ledger rows;
- attendance count from linked `bookings` in `attended`/`no_show` plus `student_weekly_attendance`;
- `can_delete=false` and a Spanish reason when attendance exists.

Use `SECURITY DEFINER SET search_path = public`, revoke `PUBLIC` and `anon`, and grant only `authenticated` and `service_role`.

**Step 2: Implement delete RPC**

Redefine `admin_delete_student_membership(p_membership_id uuid) RETURNS jsonb` to:

1. validate authenticated admin;
2. lock the membership `FOR UPDATE`;
3. lock all linked booking rows `FOR UPDATE`;
4. reject any linked `attended`/`no_show` booking or weekly no-show record;
5. delete all remaining linked bookings;
6. delete linked payments and credit ledger rows;
7. delete the membership;
8. call `sync_student_membership_operational_status(student_id)`;
9. return `success`, membership id, and deletion counts.

The exception handler must return `success=false` without leaving partial deletes.

**Step 3: Run focused tests to verify GREEN**

```powershell
npx vitest run tests/supabase/multipleActiveMemberships.test.ts tests/supabase/adminDeleteExpiredMemberships.test.ts tests/supabase/studentOperationalStatusAutomation.test.ts
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add supabase/migrations/20260801_190000_multiple_active_student_memberships.sql tests/supabase
git commit -m "feat(memberships): delete mistaken cycles atomically"
```

### Task 3: Expose deletion preview and unrestricted correction action in admin UI

**Files:**
- Modify: `lib/utils/adminMembershipDeletion.ts`
- Modify: `tests/lib/adminMembershipDeletion.test.ts`
- Modify: `app/admin/membresias/page.tsx`
- Modify: `tests/app/adminMembershipsActiveAndPlans.test.ts`
- Modify: `tests/app/adminMultipleMembershipCycles.test.ts`

**Step 1: Write failing UI and utility tests**

Require that:

- active, scheduled, queued, expired, and historical memberships expose the deletion action;
- the UI calls `admin_get_membership_deletion_preview` before opening confirmation;
- the confirmation names the membership and shows booking/payment counts;
- a blocked preview shows its reason and never calls the delete RPC;
- the action text is `Eliminar membresía`, not `Eliminar vencida`;
- successful deletion invalidates memberships, students, bookings, weekly attendance, and finance queries;
- editing remains available.

Run:

```powershell
npx vitest run tests/lib/adminMembershipDeletion.test.ts tests/app/adminMembershipsActiveAndPlans.test.ts tests/app/adminMultipleMembershipCycles.test.ts
```

Expected: FAIL for the old expired-only rule and missing preview RPC.

**Step 2: Implement the minimal UI**

- Replace the expired-only helper with a correction eligibility helper that allows the action for persisted memberships; backend attendance checks remain authoritative.
- Fetch preview on click and surface loading/errors.
- Build a destructive confirmation from returned counts.
- Call delete RPC only after confirmation.
- Show returned counts in the success toast.
- Preserve the edit panel and all existing cache invalidations; add finance invalidation where needed.

**Step 3: Run focused tests to verify GREEN**

Run the same focused command and expect PASS.

**Step 4: Commit**

```powershell
git add app/admin/membresias/page.tsx lib/utils/adminMembershipDeletion.ts tests/app tests/lib
git commit -m "feat(admin): add corrective membership deletion"
```

### Task 4: Verify the complete branch

**Files:**
- Inspect: all changes from `main` to `HEAD`

**Step 1: Run complete automated verification**

```powershell
npm test
npx tsc --noEmit --incremental false --pretty false
npm run lint
npm run build
git diff --check main..HEAD
git status --short
```

Expected: all commands exit 0 and worktree is clean.

**Step 2: Review security and behavior**

Confirm no client-side table deletes, no executable permission for `PUBLIC`/`anon`, attendance/no-show guards cover bookings and weekly attendance, FIFO behavior remains unchanged, and editing still works.

### Task 5: Apply database migration and validate Supabase

**Files:**
- Apply: `supabase/migrations/20260801_190000_multiple_active_student_memberships.sql`

**Step 1: Inspect CLI/link state**

```powershell
npx supabase --version
npx supabase migration list
npx supabase db push --dry-run
```

Resolve migration-history drift before any write. Do not expose secrets.

**Step 2: Apply pending migration**

```powershell
npx supabase db push
```

Expected: the multiple-membership migration, including deletion RPCs, is applied once.

**Step 3: Validate database state**

Use read-only SQL/CLI evidence to confirm both RPC definitions, ACLs, and migration history. Run database advisors/lint and distinguish new findings from pre-existing ones.

### Task 6: Merge, push, deploy, and verify production

**Files:**
- Merge branch: `codex/multiple-active-memberships` into `main`

**Step 1: Update and merge main**

```powershell
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git merge --no-ff codex/multiple-active-memberships
```

Resolve no unrelated worktree changes. Re-run `npm test`, lint, TypeScript, and build on the merged result.

**Step 2: Push main**

```powershell
git push origin main
```

Confirm `HEAD`, `origin/main`, and the pushed SHA match.

**Step 3: Deploy production**

Use the linked Vercel project. Prefer the Git-triggered production deployment for the pushed `main`; if necessary, run the pinned/project CLI production command. Wait until status is `READY`.

**Step 4: Production verification**

Verify the deployment commit matches `main`, `/`, `/login`, `/admin/alumnos`, and `/admin/membresias` return HTTP 200, and scan recent production errors. Report the production URL, deployment status, commit SHA, migration state, and any observability gaps.
