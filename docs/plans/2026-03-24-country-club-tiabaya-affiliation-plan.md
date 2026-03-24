# Country Club Tiabaya Affiliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a student-level Country Club Tiabaya affiliation flag that admins can create, edit, and see at a glance, plus a dashboard KPI for active CCT students.

**Architecture:** Keep the affiliation on `public.students` as a boolean source-of-truth field. Thread it through the existing admin student API and hooks, then surface it in the admin student list and dashboard using the existing RPC-based stats flow.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase JS, Supabase SQL migrations, Vitest, ESLint

---

### Task 1: Add failing tests for the new student affiliation field

**Files:**
- Modify: `app/api/admin/create-student/route.test.ts`
- Create: `lib/hooks/useDashboardStats.test.ts`

**Step 1: Write the failing API test for create payload persistence**

Add a test in `app/api/admin/create-student/route.test.ts` that posts:

```ts
student: {
  full_name: 'Alumno CCT',
  email: 'cct@example.com',
  is_active: true,
  is_country_club_tiabaya_member: true,
}
```

Assert that the mocked `students.insert(...)` receives:

```ts
expect.objectContaining({
  is_country_club_tiabaya_member: true,
})
```

**Step 2: Run the targeted API test to verify it fails**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run app/api/admin/create-student/route.test.ts"
```

Expected: FAIL because the route does not yet persist `is_country_club_tiabaya_member`.

**Step 3: Write the failing dashboard stats mapping test**

Create `lib/hooks/useDashboardStats.test.ts` around a small exported normalization helper from `lib/hooks/useDashboardStats.ts`. Feed it:

```ts
{
  total_alumnos_activos: 10,
  alumnos_cct_activos: 3,
}
```

Assert that the returned stats object preserves:

```ts
expect(result.alumnos_cct_activos).toBe(3)
```

**Step 4: Run the dashboard stats test to verify it fails**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run lib/hooks/useDashboardStats.test.ts"
```

Expected: FAIL because the helper or field does not yet exist.

**Step 5: Commit the red tests**

```bash
git add app/api/admin/create-student/route.test.ts lib/hooks/useDashboardStats.test.ts
git commit -m "test: cover CCT student affiliation"
```

### Task 2: Add the database field and thread it through student create/edit flows

**Files:**
- Create: `supabase/migrations/20260324_090000_add_student_cct_affiliation.sql`
- Modify: `app/api/admin/create-student/route.ts`
- Modify: `app/admin/alumnos/editar/[id]/page.tsx`
- Modify: `lib/hooks/useStudentDetail.ts`

**Step 1: Write the migration**

Create an additive migration with:

```sql
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_country_club_tiabaya_member boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.is_country_club_tiabaya_member IS
  'Marca si el alumno pertenece al Country Club Tiabaya.';
```

**Step 2: Update the route payload types**

Add the boolean to `StudentPayload` in `app/api/admin/create-student/route.ts`:

```ts
is_country_club_tiabaya_member?: boolean
```

**Step 3: Update row normalization**

Extend `studentRowFromPayload(...)` to return:

```ts
is_country_club_tiabaya_member: !!student.is_country_club_tiabaya_member,
```

**Step 4: Update create/update persistence**

Ensure the normalized student row is what gets inserted and updated so both POST and PUT carry the new boolean into `students`.

**Step 5: Load the field in student detail**

Add `is_country_club_tiabaya_member` to the student select in `lib/hooks/useStudentDetail.ts` and include it in the returned typed object.

**Step 6: Add the checkbox to the student editor**

In `app/admin/alumnos/editar/[id]/page.tsx`:

- extend `StudentFormState`
- default it to `false`
- hydrate it from `detailQuery.data`
- include it in the POST/PUT payload
- render a checkbox labeled `Afiliado al Country Club Tiabaya`

**Step 7: Run the API test to verify it passes**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run app/api/admin/create-student/route.test.ts"
```

Expected: PASS

**Step 8: Commit**

```bash
git add supabase/migrations/20260324_090000_add_student_cct_affiliation.sql app/api/admin/create-student/route.ts app/admin/alumnos/editar/[id]/page.tsx lib/hooks/useStudentDetail.ts app/api/admin/create-student/route.test.ts
git commit -m "feat: add CCT flag to students"
```

### Task 3: Surface the CCT status in the student list

**Files:**
- Modify: `lib/queries/studentQueries.ts`
- Modify: `app/admin/alumnos/page.tsx`

**Step 1: Write the failing list mapping expectation**

Add a focused unit test to `lib/queries/studentQueries.test.ts` if needed by extracting a small row-mapping helper from `lib/queries/studentQueries.ts`. The test should prove that when raw student data has:

```ts
is_country_club_tiabaya_member: true
```

the mapped row also has:

```ts
is_country_club_tiabaya_member: true
```

**Step 2: Run the list mapping test to verify it fails**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run lib/queries/studentQueries.test.ts"
```

Expected: FAIL because the field is not yet selected or mapped.

**Step 3: Select and map the field**

In `lib/queries/studentQueries.ts`:

- add the field to `StudentListRow`
- select it from `students`
- map it into the returned list row

**Step 4: Render the green `CCT` badge**

In `app/admin/alumnos/page.tsx`, render a compact green badge near the student name only when the field is true:

```tsx
<span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300">
  CCT
</span>
```

**Step 5: Run the list test to verify it passes**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run lib/queries/studentQueries.test.ts"
```

Expected: PASS

**Step 6: Commit**

```bash
git add lib/queries/studentQueries.ts lib/queries/studentQueries.test.ts app/admin/alumnos/page.tsx
git commit -m "feat: show CCT badge in student list"
```

### Task 4: Add the dashboard KPI for active CCT students

**Files:**
- Modify: `supabase/migrations/20260318_130000_extend_dashboard_stats_kpis.sql`
- Modify: `lib/hooks/useDashboardStats.ts`
- Modify: `app/admin/page.tsx`
- Optional modify: `supabase/consolidated_from_scratch.sql`

**Step 1: Extend the dashboard RPC**

Update `supabase/migrations/20260318_130000_extend_dashboard_stats_kpis.sql` to:

- declare `v_alumnos_cct_activos integer := 0;`
- count:

```sql
SELECT COUNT(*)::integer
INTO v_alumnos_cct_activos
FROM public.students s
WHERE COALESCE(s.is_active, true) = true
  AND COALESCE(s.is_country_club_tiabaya_member, false) = true;
```

- return:

```sql
'alumnos_cct_activos', v_alumnos_cct_activos,
```

**Step 2: Add the TypeScript field**

In `lib/hooks/useDashboardStats.ts`:

- add `alumnos_cct_activos: number` to `DashboardStats`
- add it to `initialState`
- ensure the normalization helper preserves it from RPC data

**Step 3: Add the dashboard card**

In `app/admin/page.tsx`, add one KPI card with:

- title: `Alumnos CCT activos`
- value: `stats.alumnos_cct_activos`
- helper: `Afiliados activos del club`
- green accent

**Step 4: Run the dashboard test to verify it passes**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run lib/hooks/useDashboardStats.test.ts"
```

Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/20260318_130000_extend_dashboard_stats_kpis.sql lib/hooks/useDashboardStats.ts app/admin/page.tsx
git commit -m "feat: add active CCT dashboard KPI"
```

### Task 5: Final verification

**Files:**
- Verify: `app/api/admin/create-student/route.test.ts`
- Verify: `lib/hooks/useDashboardStats.test.ts`
- Verify: `lib/queries/studentQueries.test.ts`
- Verify: changed UI and SQL files

**Step 1: Run the focused test suite**

Run:

```powershell
cmd /c ".\node_modules\.bin\vitest.cmd run app/api/admin/create-student/route.test.ts lib/hooks/useDashboardStats.test.ts lib/queries/studentQueries.test.ts"
```

Expected: PASS

**Step 2: Run lint**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: no errors; pre-existing warnings may remain if unrelated.

**Step 3: Manual verification**

Check in the app:

1. Create a new student with the checkbox enabled and verify it saves.
2. Edit an existing student and toggle the checkbox.
3. Confirm a green `CCT` badge appears in `/admin/alumnos`.
4. Confirm the admin dashboard shows the updated `Alumnos CCT activos` count.

**Step 4: Commit final polish if needed**

```bash
git add app api lib supabase
git commit -m "chore: finish CCT affiliation rollout"
```
