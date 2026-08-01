# Multiple Active Student Memberships Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow each student to hold separate paid, gifted, current, and future memberships while consuming the oldest eligible membership first.

**Architecture:** Keep each entitlement as its own `student_memberships` row, remove the one-active-row constraint, and centralize FIFO eligibility in PostgreSQL so student booking, admin booking, attendance, and weekly no-show flows agree. Add a transactional multi-period assignment RPC and pure TypeScript preview/status helpers so the admin UI can show exactly what will be created and keep student summaries truthful.

**Tech Stack:** Next.js App Router, React, TypeScript, TanStack Query, Tailwind CSS, Supabase/PostgreSQL PL/pgSQL, Vitest.

---

Implementation must follow `@archery-pwa-v2`, `@test-driven-development`, `@supabase:supabase`, and `@verification-before-completion`. Use `students.id` as the student identity, retain RLS/ACL protections, and invalidate `studentKeys.all` after membership mutations.

### Task 1: Lock the multi-membership database contract with failing tests

**Files:**
- Create: `tests/supabase/multipleActiveMemberships.test.ts`
- Modify: `tests/supabase/adminAssignMembershipPlan.test.ts`
- Modify: `tests/supabase/studentOperationalStatusAutomation.test.ts`
- Test: `tests/supabase/multipleActiveMemberships.test.ts`

**Step 1: Write the failing migration contract test**

Create a test that loads `supabase/migrations/20260801_190000_multiple_active_student_memberships.sql` and asserts the new contract:

```ts
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260801_190000_multiple_active_student_memberships.sql'), 'utf8')

expect(sql).toContain('DROP INDEX IF EXISTS public.idx_student_memberships_one_active')
expect(sql).toContain("membership_origin IN ('paid', 'gift')")
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.select_student_membership_for_date')
expect(sql).toMatch(/ORDER BY[\s\S]*sm\.start_date ASC[\s\S]*sm\.created_at ASC[\s\S]*sm\.id ASC/)
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_create_student_membership_cycles')
expect(sql).not.toMatch(/UPDATE public\.student_memberships[\s\S]*status = 'historical'[\s\S]*WHERE student_id = p_student_id/)
```

Also assert that the selector subtracts pending reservations per membership, both booking RPCs call the selector, weekly no-show uses the oldest eligible row, privileged RPCs revoke `PUBLIC`/`anon`, and the bulk RPC grants only `authenticated, service_role`.

**Step 2: Replace obsolete legacy expectations**

Update `adminAssignMembershipPlan.test.ts` so it reads the new migration and expects creation without historical replacement. In `studentOperationalStatusAutomation.test.ts`, keep historical-migration assertions scoped to the old migration but add a regression assertion that the latest migration drops the unique index and does not close sibling memberships.

**Step 3: Run the focused tests to verify they fail**

Run:

```powershell
npx vitest run tests/supabase/multipleActiveMemberships.test.ts tests/supabase/adminAssignMembershipPlan.test.ts tests/supabase/studentOperationalStatusAutomation.test.ts
```

Expected: FAIL because the new migration and FIFO functions do not exist.

**Step 4: Commit the failing tests**

```powershell
git add tests/supabase/multipleActiveMemberships.test.ts tests/supabase/adminAssignMembershipPlan.test.ts tests/supabase/studentOperationalStatusAutomation.test.ts
git commit -m "test(memberships): define multiple active cycle contract"
```

### Task 2: Add the schema, FIFO selector, and transactional cycle creation

**Files:**
- Create: `supabase/migrations/20260801_190000_multiple_active_student_memberships.sql`
- Test: `tests/supabase/multipleActiveMemberships.test.ts`

**Step 1: Add the additive schema changes**

In one transaction:

```sql
DROP INDEX IF EXISTS public.idx_student_memberships_one_active;

ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS membership_origin text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS assignment_batch_id uuid;

ALTER TABLE public.student_memberships
  ADD CONSTRAINT student_memberships_origin_check
  CHECK (membership_origin IN ('paid', 'gift'));

CREATE INDEX IF NOT EXISTS idx_student_memberships_fifo
  ON public.student_memberships(student_id, status, start_date, created_at, id);
```

Make constraint creation idempotent with a `pg_constraint` guard. Existing rows remain `paid`; do not reopen or rewrite historical rows.

**Step 2: Implement one canonical FIFO selector**

Create `public.select_student_membership_for_date(p_student_id uuid, p_service_date date)` returning `student_memberships`. Its candidate query must:

```sql
WHERE sm.student_id = p_student_id
  AND sm.status = 'active'
  AND sm.start_date <= p_service_date
  AND (sm.end_date IS NULL OR sm.end_date >= p_service_date)
  AND sm.classes_remaining > (
    SELECT count(*)
    FROM public.bookings b
    WHERE b.active_membership_id = sm.id
      AND b.status = 'reserved'
  )
ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC
LIMIT 1;
```

Use `SECURITY INVOKER`; revoke execution from `PUBLIC` and `anon`, and grant it to `authenticated` and `service_role`. The caller remains responsible for student access/admin checks.

**Step 3: Replace single-cycle assignment without closing siblings**

Redefine `admin_assign_membership_plan(...)` with the existing signature so legacy callers continue working. Preserve its student/plan/admin validations, payment row, ledger row, and return type, but remove the update that sets other active memberships to `historical`. Set `membership_origin = 'paid'` and a fresh `assignment_batch_id`.

**Step 4: Add transactional multi-period and gift creation**

Create:

```sql
public.admin_create_student_membership_cycles(
  p_student_id uuid,
  p_membership_plan_id uuid DEFAULT NULL,
  p_start_date date DEFAULT current_date,
  p_period_count integer DEFAULT 1,
  p_origin text DEFAULT 'paid',
  p_gift_classes integer DEFAULT NULL,
  p_gift_end_date date DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL,
  p_payment_amount numeric DEFAULT NULL,
  p_payment_type text DEFAULT 'manual',
  p_discount_type text DEFAULT 'none',
  p_discount_value numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS SETOF public.student_memberships
```

Validate admin identity, `p_period_count BETWEEN 1 AND 12`, active plan for paid cycles, positive gift classes, valid dates, allowed payment/discount types, and nonnegative amounts. Generate one batch UUID, loop periods in chronological order, calculate inclusive end dates from `duration_days`, insert one membership/payment/ledger row per period, and return all rows ordered by start date. A repeated non-null idempotency key returns the existing batch instead of inserting duplicates.

For a gift, force one period, `total_amount = 0`, `payment_amount = 0`, payment status `waived`, `membership_origin = 'gift'`, and a visible default name such as `Obsequio · 1 clase`.

**Step 5: Run the focused contract tests**

Run the Task 1 Vitest command.

Expected: PASS.

**Step 6: Commit**

```powershell
git add supabase/migrations/20260801_190000_multiple_active_student_memberships.sql tests/supabase
git commit -m "feat(memberships): support separate active cycles"
```

### Task 3: Route every automatic consumption path through FIFO

**Files:**
- Modify: `supabase/migrations/20260801_190000_multiple_active_student_memberships.sql`
- Modify: `tests/supabase/multipleActiveMemberships.test.ts`
- Modify: `tests/supabase/attendanceConsumesMembership.test.ts`
- Modify: `tests/supabase/weeklyAttendanceReview.test.ts`

**Step 1: Add failing behavior assertions**

Assert that both `book_session(uuid, uuid)` and `admin_book_session(uuid, uuid, text, boolean)` call `select_student_membership_for_date` with the session date in `America/Lima`, and that neither selects `ORDER BY ... start_date DESC` directly. Assert that `admin_mark_weekly_no_show` selects and locks the oldest eligible membership for `p_sunday`.

**Step 2: Run tests and confirm failure**

```powershell
npx vitest run tests/supabase/multipleActiveMemberships.test.ts tests/supabase/attendanceConsumesMembership.test.ts tests/supabase/weeklyAttendanceReview.test.ts
```

Expected: FAIL until the RPCs are redefined in the latest migration.

**Step 3: Redefine student and admin booking RPCs**

Copy the latest function bodies from `20260603_090000_student_operational_status_automation.sql`, preserving access, status, cutoff, capacity, bow, duplicate-booking, and forced-booking rules. Replace only membership selection with the canonical helper. Lock the returned membership row before insert and revalidate free balance to avoid two concurrent bookings consuming the same availability.

Keep `bookings.active_membership_id = v_membership.id`; attendance and cancellation already mutate that linked row and must not reselect another membership.

**Step 4: Redefine weekly review and marking**

Update `get_weekly_attendance_review(date)` so one student appears once even with several eligible memberships. Use a lateral FIFO candidate for label/saldo and `EXISTS` for eligibility. Redefine `admin_mark_weekly_no_show(uuid, date)` using the same ascending order and `FOR UPDATE`, preserving its idempotency and ledger linkage.

**Step 5: Keep operational status student-wide**

Ensure `sync_student_membership_operational_status` treats the student as active when any currently usable membership exists. Do not let a future membership activate a student before `start_date`, and never override protected statuses (`retired`, `withdrawn`, `blocked`, `suspended`).

**Step 6: Run tests and commit**

Run the focused command again; expected PASS.

```powershell
git add supabase/migrations/20260801_190000_multiple_active_student_memberships.sql tests/supabase
git commit -m "fix(memberships): consume oldest eligible cycle first"
```

### Task 4: Build and test cycle preview/status utilities

**Files:**
- Create: `lib/utils/membershipCycles.ts`
- Create: `lib/utils/membershipCycles.test.ts`

**Step 1: Write failing unit tests**

Cover:

- two 30-day periods from `2026-08-01` produce `2026-08-01..2026-08-30` and `2026-08-31..2026-09-29`;
- suggested start is one day after the latest open membership end date;
- overlapping memberships sort oldest first;
- future membership is `scheduled`;
- first eligible membership is `current`, later eligible rows are `queued`;
- consumed/vencida labels do not contribute to usable total;
- gift preview has cost zero and requested class count.

Use exported types and pure functions:

```ts
export type MembershipOrigin = 'paid' | 'gift'
export type MembershipDisplayStatus = 'current' | 'scheduled' | 'queued' | 'consumed' | 'expired' | 'cancelled' | 'historical'

export function buildMembershipCyclePreview(input: CyclePreviewInput): MembershipCyclePreview[]
export function suggestNextMembershipStart(memberships: MembershipLike[], today: string): string
export function summarizeMemberships(memberships: MembershipLike[], serviceDate: string): MembershipSummary
```

**Step 2: Verify failure**

```powershell
npx vitest run lib/utils/membershipCycles.test.ts
```

Expected: FAIL because the module does not exist.

**Step 3: Implement minimal pure helpers**

Use UTC date arithmetic on ISO date-only values. `summarizeMemberships` must sort by `start_date`, `created_at`, and `id` ascending and return `{ usableClasses, openCount, currentMembershipId, statusesById }`.

**Step 4: Verify and commit**

Run the focused test; expected PASS.

```powershell
git add lib/utils/membershipCycles.ts lib/utils/membershipCycles.test.ts
git commit -m "feat(memberships): add cycle preview and status helpers"
```

### Task 5: Add a typed membership creation service

**Files:**
- Create: `lib/services/adminMembershipService.ts`
- Create: `lib/services/adminMembershipService.test.ts`

**Step 1: Write the failing service tests**

Mock the Supabase client and verify paid and gift payload mappings:

```ts
expect(client.rpc).toHaveBeenCalledWith('admin_create_student_membership_cycles', {
  p_student_id: 'student-1',
  p_membership_plan_id: 'plan-1',
  p_start_date: '2026-08-01',
  p_period_count: 2,
  p_origin: 'paid',
  // remaining normalized fields
})
```

Assert Supabase errors are thrown and that gift requests send `p_gift_classes`, zero amounts, and no plan ID.

**Step 2: Verify failure**

```powershell
npx vitest run lib/services/adminMembershipService.test.ts
```

Expected: FAIL because the service does not exist.

**Step 3: Implement the typed wrapper**

Export `createStudentMembershipCycles(client, input)` and normalize optional values to `null`, not `undefined`. Generate a `crypto.randomUUID()` idempotency key once per submitted operation and return the RPC rows.

**Step 4: Verify and commit**

```powershell
npx vitest run lib/services/adminMembershipService.test.ts
git add lib/services/adminMembershipService.ts lib/services/adminMembershipService.test.ts
git commit -m "feat(memberships): add transactional assignment service"
```

### Task 6: Redesign the admin membership assignment flow

**Files:**
- Modify: `app/admin/membresias/page.tsx`
- Modify: `lib/hooks/useMembershipPlans.ts`
- Create: `tests/app/adminMultipleMembershipCycles.test.ts`
- Modify: `tests/app/adminMembershipsRedesignBlock1.test.ts`

**Step 1: Write failing UI contract tests**

Assert the page contains `Membresia pagada`, `Obsequio`, `Cantidad de periodos`, `Vista previa`, `En consumo`, and `Programada`; imports the new preview helpers/service; calls `admin_create_student_membership_cycles`; and no longer contains replacement warnings or “pasa a historial”. Assert `useMembershipPlans` selects `membership_origin` and `assignment_batch_id`.

**Step 2: Verify failure**

```powershell
npx vitest run tests/app/adminMultipleMembershipCycles.test.ts tests/app/adminMembershipsRedesignBlock1.test.ts
```

Expected: FAIL on the new labels/service and obsolete replacement copy.

**Step 3: Extend types and query fields**

Add `membership_origin` and `assignment_batch_id` to `AdminStudentMembership` and `studentMembershipSelect`. Use `summarizeMemberships` instead of `Array.find(status === 'active')` when determining a student's current membership.

**Step 4: Implement the approved form**

Extend `AssignmentFormState` with:

```ts
origin: 'paid' | 'gift'
period_count: string
gift_classes: string
gift_end_date: string
payment_type: 'manual' | 'cash' | 'card' | 'transfer' | 'yape' | 'plin'
```

For paid memberships show plan, period count `1..12`, first start, discount/payment controls, per-cycle preview, and combined total. For gifts show classes, start/end, cost zero, and reason notes. Auto-suggest the next start when the student changes, but preserve a date the admin manually edits.

**Step 5: Replace submission and refresh behavior**

Call `createStudentMembershipCycles`, show a confirmation listing every cycle, and on success invalidate:

```ts
studentKeys.all
membershipPlanKeys.all
['admin-students']
['admin-bookings']
['weekly-attendance-review']
```

Then call the existing `refreshAll()` so the new rows appear without F5.

**Step 6: Render truthful membership states**

Use `summarizeMemberships` for `En consumo`, `Programada`, `En espera`, `Consumida`, and `Vencida`. Show an `Obsequio` badge and retain each row's dates/saldo. Remove replacement warnings and wording.

**Step 7: Run tests and commit**

```powershell
npx vitest run tests/app/adminMultipleMembershipCycles.test.ts tests/app/adminMembershipsRedesignBlock1.test.ts lib/utils/membershipCycles.test.ts lib/services/adminMembershipService.test.ts
git add app/admin/membresias/page.tsx lib/hooks/useMembershipPlans.ts tests/app
git commit -m "feat(admin): manage multiple membership cycles"
```

### Task 7: Aggregate student list/detail balances and show the consumption queue

**Files:**
- Modify: `lib/queries/studentQueries.ts`
- Modify: `lib/queries/studentQueries.test.ts`
- Modify: `lib/hooks/useStudentDetail.ts`
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Modify: `app/admin/alumnos/page.tsx`
- Create: `tests/app/adminStudentMembershipQueue.test.ts`

**Step 1: Write failing mapping tests**

Add a student with an older current membership containing two classes and a future membership containing eight. Expect the list row to expose:

```ts
classes_remaining: 2
total_open_classes: 10
open_membership_count: 2
membership_name: 'Plan antiguo'
```

Add a same-date overlapping case and expect the oldest created membership to be primary. Add UI assertions for `10 clases en 2 membresias` and the queue labels.

**Step 2: Verify failure**

```powershell
npx vitest run lib/queries/studentQueries.test.ts tests/app/adminStudentMembershipQueue.test.ts
```

Expected: FAIL because summaries currently choose the first active row.

**Step 3: Update list mapping**

Extend `StudentListRow` with `total_open_classes` and `open_membership_count`. Reuse `summarizeMemberships`; keep `classes_remaining` as the currently consumable membership balance for compatibility and expose the aggregate separately. Select `id`, `classes_total`, `created_at`, and `membership_origin` from nested memberships.

**Step 4: Update detail mapping**

Add `membership_origin` and `assignment_batch_id` to `StudentMembershipSummary`. Sort active rows oldest first, compute `active_membership` as the FIFO current row, and add `total_open_classes` plus `open_membership_count` to `StudentDetailData`.

**Step 5: Update student surfaces**

In the list card show aggregate wording when more than one membership is open. In the detail KPIs show total available/open count, while the membership section lists each row with exact dates, origin, balance, and derived status. Keep edits scoped to the selected membership and keep ledger/payment references unchanged.

**Step 6: Verify and commit**

```powershell
npx vitest run lib/queries/studentQueries.test.ts tests/app/adminStudentMembershipQueue.test.ts tests/app/adminStudentProfileOperationalRedesign.test.ts
git add lib/queries/studentQueries.ts lib/queries/studentQueries.test.ts lib/hooks/useStudentDetail.ts app/admin/alumnos tests/app/adminStudentMembershipQueue.test.ts
git commit -m "feat(students): show separate membership balances"
```

### Task 8: Verify schema, application, and runtime behavior

**Files:**
- Modify if required: `supabase/consolidated_from_scratch.sql`
- Modify if required: generated Supabase types used by the repository
- Test: full repository

**Step 1: Check the migration against current Supabase guidance**

Use `@supabase:supabase` to verify current PostgreSQL/RPC/RLS guidance before applying anything. Confirm the linked project and `.env.local` exist. Inspect the remote migration list and schema diff; do not claim live success if the project cannot be verified.

**Step 2: Run the full local gate**

Run in this order:

```powershell
npm test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: 0 failures, 0 lint errors, successful production build, no whitespace errors, and only intended files changed.

**Step 3: Apply and validate the migration when release is authorized**

Use the repository's linked Supabase CLI workflow to apply only the new migration. Validate in a transaction or with disposable fixtures:

1. create two paid periods and one one-class gift for a test student;
2. confirm all rows remain separate;
3. confirm first booking binds the oldest eligible membership;
4. fill its free balance with reservations and confirm the next booking binds the next eligible membership;
5. mark attendance and verify only the booking-linked membership and ledger move;
6. roll back or remove disposable fixtures without touching real student balances.

**Step 4: Run authenticated browser verification**

Use `@vercel:agent-browser-verify` against a local production server or authorized deployment. Verify `/admin/membresias` can preview/create two periods, create a gift, update without F5, and display separate rows. Verify `/admin/alumnos/[id]` shows aggregate and per-membership balances.

**Step 5: Final implementation commit**

```powershell
git add supabase/consolidated_from_scratch.sql <generated-types-if-any>
git commit -m "chore(memberships): finalize multiple cycle support"
```

Skip this commit if no generated/consolidated artifacts changed.

**Step 6: Prepare integration handoff**

Record exact test counts, lint/build results, migration verification evidence, branch SHA, and worktree status. Do not merge, push, apply production migrations, or deploy until the user explicitly authorizes that release step.
