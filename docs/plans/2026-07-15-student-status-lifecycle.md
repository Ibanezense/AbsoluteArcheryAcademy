# Student Status Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Derive five visible student states from membership expiration age and order the admin list by operational priority and student name.

**Architecture:** Keep the behavior in `lib/utils/adminStudentList.ts`, using `membership_expired_at` as the primary timestamp and `membership_end + 1 day` as a historical fallback. Expose one filter-and-sort function so desktop and mobile presentations consume the same ordered collection without duplicating business rules.

**Tech Stack:** TypeScript, dayjs, React/Next.js, Vitest, Tailwind CSS.

---

### Task 1: Define lifecycle boundaries with failing tests

**Files:**
- Modify: `lib/utils/adminStudentList.test.ts`

**Step 1: Write the failing tests**

Add cases proving:

```ts
expect(statusAtDay(14)).toBe('expired')
expect(statusAtDay(15)).toBe('paused')
expect(statusAtDay(60)).toBe('paused')
expect(statusAtDay(61)).toBe('inactive')
```

Also prove that an active membership with zero raw classes is `expired`, and that protected operational states remain `inactive`.

**Step 2: Run tests to verify they fail**

Run: `npm test -- lib/utils/adminStudentList.test.ts`

Expected: FAIL because `expired` is not part of the visible status model and the day-61 transition is not implemented.

**Step 3: Commit the test contract**

```bash
git add lib/utils/adminStudentList.test.ts
git commit -m "test(admin): define student status aging boundaries"
```

### Task 2: Implement the five-state lifecycle

**Files:**
- Modify: `lib/utils/adminStudentList.ts`
- Test: `lib/utils/adminStudentList.test.ts`

**Step 1: Implement the minimal lifecycle**

Extend the union with `expired`. Calculate whole calendar days since `membership_expired_at`, falling back to the day after `membership_end`. Apply this precedence:

```ts
protected operational state -> inactive
valid active membership ending in 0..7 days -> expiring
valid active membership -> active
expired age >= 61 -> inactive
expired age >= 15 -> paused
expired membership -> expired
```

**Step 2: Run the focused tests**

Run: `npm test -- lib/utils/adminStudentList.test.ts`

Expected: PASS.

**Step 3: Commit**

```bash
git add lib/utils/adminStudentList.ts lib/utils/adminStudentList.test.ts
git commit -m "feat(admin): age expired students through inactive status"
```

### Task 3: Define and implement priority ordering

**Files:**
- Modify: `lib/utils/adminStudentList.test.ts`
- Modify: `lib/utils/adminStudentList.ts`

**Step 1: Write a failing order test**

Create an intentionally shuffled set with every status and two active students. Assert this order:

```ts
['Activo A', 'Activo Z', 'Por vencer', 'Vencido', 'En pausa', 'Inactivo']
```

**Step 2: Verify RED**

Run: `npm test -- lib/utils/adminStudentList.test.ts`

Expected: FAIL because filtering currently preserves source order.

**Step 3: Implement stable priority and name ordering**

Add a status-rank map in the order `active`, `expiring`, `expired`, `paused`, `inactive`. Return a copied, filtered array sorted by rank and then `full_name.localeCompare(..., 'es')`.

**Step 4: Verify GREEN and commit**

Run: `npm test -- lib/utils/adminStudentList.test.ts`

```bash
git add lib/utils/adminStudentList.ts lib/utils/adminStudentList.test.ts
git commit -m "feat(admin): order students by status priority"
```

### Task 4: Add the expired presentation and filter

**Files:**
- Modify: `app/admin/alumnos/page.tsx`
- Modify: `tests/app/adminStudentsCompactList.test.ts`

**Step 1: Write the failing UI contract**

Assert that the page contains the `expired` filter value and the `Vencido` badge presentation.

**Step 2: Verify RED**

Run: `npm test -- tests/app/adminStudentsCompactList.test.ts`

Expected: FAIL because the option and presentation do not exist.

**Step 3: Add the UI presentation**

Add `['expired', 'Vencidos']` between `expiring` and `paused`, and add a visually distinct `Vencido` badge without changing the sidebar or table/card layout.

**Step 4: Verify GREEN and commit**

Run: `npm test -- tests/app/adminStudentsCompactList.test.ts`

```bash
git add app/admin/alumnos/page.tsx tests/app/adminStudentsCompactList.test.ts
git commit -m "feat(admin): show expired students in compact list"
```

### Task 5: Verify and restart the production server

**Files:**
- No source changes expected.

**Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass.

**Step 2: Run lint and build with the main checkout environment**

Run the repository ESLint configuration and `npm run build`, loading the existing root `.env.local` into the process without copying or printing secrets.

Expected: exit code 0.

**Step 3: Replace the running production process**

Stop only the listener on port 3000, then start `npm run start -- -p 3000` hidden in the background with redirected logs.

**Step 4: Verify runtime**

Request `/login` and `/admin/alumnos`; require HTTP 200, an active port-3000 listener and an empty error log.

**Step 5: Confirm repository state**

Run: `git status --short` and `git diff --check`.

Expected: clean worktree and no whitespace errors.
