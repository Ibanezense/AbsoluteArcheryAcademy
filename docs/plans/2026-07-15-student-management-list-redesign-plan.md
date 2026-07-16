# Compact Student Management List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the oversized student dashboard cards in `/admin/alumnos` with a compact, searchable, status-filterable list that shows membership, latest attendance, and enrollment date on desktop and mobile.

**Architecture:** Keep `students` as the canonical list source and enrich it with one filtered read of attended bookings, reducing those rows to the latest class date per student. Extract visible-status and filtering rules into a pure utility, then rebuild only the students page with shared row data and separate desktop/mobile presentations while preserving the existing admin layout.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, TanStack Query, Supabase JS, Tailwind CSS, Lucide React, Day.js, Vitest.

---

### Task 1: Add list-specific status and filtering rules

**Files:**
- Create: `lib/utils/adminStudentList.ts`
- Create: `lib/utils/adminStudentList.test.ts`

**Step 1: Write the failing status tests**

Create `lib/utils/adminStudentList.test.ts` with focused fixtures that assert:

```ts
import { describe, expect, it } from 'vitest'
import { filterAdminStudents, getAdminStudentStatus } from '@/lib/utils/adminStudentList'

const baseStudent = {
  id: 'student-1',
  full_name: 'Ana Torres',
  dni: '12345678',
  phone: '999111222',
  email: null,
  membership_end: '2026-07-30',
  membership_status: 'active',
  effective_operational_status: 'active',
} as any

describe('getAdminStudentStatus', () => {
  it('marks an active membership ending within seven days as expiring', () => {
    expect(getAdminStudentStatus({ ...baseStudent, membership_end: '2026-07-20' }, new Date('2026-07-15T12:00:00-05:00'))).toBe('expiring')
  })

  it.each(['retired', 'withdrawn', 'blocked', 'suspended'])('groups %s as inactive', (status) => {
    expect(getAdminStudentStatus({ ...baseStudent, effective_operational_status: status })).toBe('inactive')
  })

  it.each(['paused', 'expired'])('groups %s as paused', (status) => {
    expect(getAdminStudentStatus({ ...baseStudent, effective_operational_status: status })).toBe('paused')
  })
})

describe('filterAdminStudents', () => {
  it('matches normalized name, DNI, and phone values', () => {
    expect(filterAdminStudents([baseStudent], 'ana', 'all')).toHaveLength(1)
    expect(filterAdminStudents([baseStudent], '12345678', 'all')).toHaveLength(1)
    expect(filterAdminStudents([baseStudent], '999111222', 'all')).toHaveLength(1)
  })

  it('filters by the visible status', () => {
    expect(filterAdminStudents([baseStudent], '', 'active')).toHaveLength(1)
    expect(filterAdminStudents([baseStudent], '', 'inactive')).toHaveLength(0)
  })
})
```

**Step 2: Run the new test and confirm failure**

Run: `npm test -- lib/utils/adminStudentList.test.ts`

Expected: FAIL because `lib/utils/adminStudentList.ts` does not exist.

**Step 3: Implement the minimal pure utility**

Create `lib/utils/adminStudentList.ts` with:

```ts
import dayjs from 'dayjs'
import type { StudentListRow } from '@/lib/queries/studentQueries'
import { norm } from '@/lib/utils/searchUtils'

export type AdminStudentStatus = 'active' | 'expiring' | 'paused' | 'inactive'
export type AdminStudentFilter = 'all' | AdminStudentStatus

const INACTIVE_STATUSES = new Set(['retired', 'withdrawn', 'blocked', 'suspended'])

export function getAdminStudentStatus(student: StudentListRow, now = new Date()): AdminStudentStatus {
  if (INACTIVE_STATUSES.has(student.effective_operational_status)) return 'inactive'
  if (student.effective_operational_status === 'paused' || student.effective_operational_status === 'expired') return 'paused'

  if (student.membership_status === 'active' && student.membership_end) {
    const daysLeft = dayjs(student.membership_end).startOf('day').diff(dayjs(now).startOf('day'), 'day')
    if (daysLeft >= 0 && daysLeft <= 7) return 'expiring'
  }

  return 'active'
}

export function filterAdminStudents(students: StudentListRow[], query: string, filter: AdminStudentFilter) {
  const needle = norm(query)
  return students.filter((student) => {
    const matchesQuery = !needle || [student.full_name, student.dni || '', student.phone || '']
      .map(norm)
      .some((value) => value.includes(needle))
    return matchesQuery && (filter === 'all' || getAdminStudentStatus(student) === filter)
  })
}
```

**Step 4: Run the utility tests**

Run: `npm test -- lib/utils/adminStudentList.test.ts`

Expected: PASS.

**Step 5: Commit the utility**

```bash
git add lib/utils/adminStudentList.ts lib/utils/adminStudentList.test.ts
git commit -m "test(admin): define compact student list states"
```

### Task 2: Enrich student rows with enrollment and latest attendance dates

**Files:**
- Modify: `lib/queries/studentQueries.ts:5-220`
- Modify: `lib/queries/studentQueries.test.ts:1-135`

**Step 1: Add failing mapper tests**

Extend `lib/queries/studentQueries.test.ts` with a base fixture helper and assertions equivalent to:

```ts
it('preserves enrollment and latest attendance dates on list rows', () => {
  const result = mapStudentListRow({
    ...studentFixture(),
    created_at: '2026-03-10T14:00:00.000Z',
    last_attendance_at: '2026-07-12T21:00:00.000Z',
  })

  expect(result.created_at).toBe('2026-03-10T14:00:00.000Z')
  expect(result.last_attendance_at).toBe('2026-07-12T21:00:00.000Z')
})
```

Also add a pure reducer test for attended booking rows:

```ts
expect(buildLastAttendanceByStudent([
  { student_id: 'student-1', attendance_marked_at: null, sessions: { start_at: '2026-07-10T20:00:00Z' } },
  { student_id: 'student-1', attendance_marked_at: null, sessions: { start_at: '2026-07-12T20:00:00Z' } },
])).toEqual(new Map([['student-1', '2026-07-12T20:00:00Z']]))
```

**Step 2: Run the mapper tests and confirm failure**

Run: `npm test -- lib/queries/studentQueries.test.ts`

Expected: FAIL because the row fields and reducer are not implemented.

**Step 3: Extend the row model and mapper**

In `lib/queries/studentQueries.ts`, add:

```ts
created_at: string
last_attendance_at: string | null
```

to `StudentListRow`, map both values in `mapStudentListRow`, and export a `buildLastAttendanceByStudent` helper. The helper must use `sessions.start_at` when present and fall back to `attendance_marked_at`, retaining the newest ISO timestamp for each `student_id`.

**Step 4: Fetch attended bookings without changing the schema**

Refactor `useStudents().queryFn` to run two reads in parallel:

```ts
const [studentsResult, attendanceResult] = await Promise.all([
  supabase.from('students').select(`... created_at, ...`).order('full_name', { ascending: true }),
  supabase
    .from('bookings')
    .select('student_id,attendance_marked_at,sessions(start_at)')
    .eq('status', 'attended')
    .not('student_id', 'is', null),
])
```

Throw either query error, reduce the attendance rows once, and call `mapStudentListRow` with the matching `last_attendance_at`. Do not add a migration, view, or RPC for this iteration.

**Step 5: Run query tests**

Run: `npm test -- lib/queries/studentQueries.test.ts`

Expected: PASS.

**Step 6: Commit the query change**

```bash
git add lib/queries/studentQueries.ts lib/queries/studentQueries.test.ts
git commit -m "feat(admin): load student enrollment and attendance dates"
```

### Task 3: Replace the students dashboard with the compact responsive list

**Files:**
- Modify: `app/admin/alumnos/page.tsx:1-486`

**Step 1: Reduce the page to one operational state model**

Import `AdminStudentFilter`, `filterAdminStudents`, and `getAdminStudentStatus`. Remove `useToast`, `useToggleStudentActive`, metrics, chart helpers, access-code reveal state, and all dashboard-only component imports. Keep only one `query` state and one `statusFilter` state.

Use:

```ts
const [statusFilter, setStatusFilter] = useState<AdminStudentFilter>('all')
const { data: students = [], isLoading, isError, refetch } = useStudents()
const filteredStudents = useMemo(
  () => filterAdminStudents(students, query, statusFilter),
  [query, statusFilter, students],
)
```

**Step 2: Build the header and single toolbar**

Keep `AdminPageHeader`, using `Agregar alumno` as the only header action. Under it, add one white bordered toolbar containing:

- a labeled search field with placeholder `Buscar por nombre, DNI o teléfono`;
- a keyboard-accessible native `select` for `Todos`, `Activos`, `Por vencer`, `En pausa`, and `Inactivos`;
- `Mostrando X de Y alumnos` aligned to the right on desktop.

Do not duplicate the search input and do not modify `app/admin/layout.tsx` or sidebar components.

**Step 3: Add the desktop table**

Render a `hidden md:block` table with headers:

```tsx
<th>Alumno</th>
<th>Teléfono</th>
<th>Membresía</th>
<th>Última asistencia</th>
<th>Fecha de ingreso</th>
<th><span className="sr-only">Acciones</span></th>
```

Each row must show `Avatar`, a linked name, the four-state badge, fallbacks `Sin teléfono`, `Sin membresía`, and `Sin asistencias`, plus a compact actions control containing links to `/admin/alumnos/${id}` and `/admin/alumnos/editar/${id}`. Use semantic links rather than an invalid clickable `<tr>`.

**Step 4: Add the mobile compact rows**

Render a `md:hidden` list using the same filtered data. Each block shows avatar/name/status first, then a two-column definition list for phone, membership, last attendance, and enrollment date. Keep explicit `Ver perfil` and `Editar` links and avoid horizontal scrolling.

**Step 5: Add stable loading, empty, and error states**

- Loading: render six skeleton rows inside the same list panel.
- Empty: show `No encontramos alumnos con estos filtros.` and keep the toolbar visible.
- Error: show `No pudimos cargar los alumnos.` with a `Reintentar` button calling `refetch()`.

Use `Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })` or the existing Day.js dependency consistently for both dates.

**Step 6: Run focused tests and lint**

Run:

```bash
npm test -- lib/utils/adminStudentList.test.ts lib/queries/studentQueries.test.ts
npm run lint
```

Expected: all focused tests pass and ESLint exits successfully.

**Step 7: Commit the page redesign**

```bash
git add app/admin/alumnos/page.tsx
git commit -m "feat(admin): redesign compact student list"
```

### Task 4: Verify the complete student-management flow

**Files:**
- Modify only if verification exposes an in-scope defect: `app/admin/alumnos/page.tsx`, `lib/queries/studentQueries.ts`, `lib/utils/adminStudentList.ts`, and their tests.

**Step 1: Run the automated gate**

Run in this order:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits with code 0.

**Step 2: Start the application for runtime verification**

Run: `npm run dev`

Expected: Next.js reports a local URL and compiles `/admin/alumnos` without runtime or console errors.

**Step 3: Verify desktop behavior**

At a desktop viewport, confirm:

- the existing sidebar is unchanged;
- only one search field appears;
- the compact table shows every approved column;
- search works with a real name, DNI, and phone;
- each visible state filter returns the correct grouped students;
- profile and edit links navigate to the expected routes;
- empty values use the approved fallbacks.

**Step 4: Verify mobile behavior**

At a mobile viewport near 390 px, confirm:

- there is no horizontal scrollbar;
- each student is readable as a compact two-column block;
- the status, search, filter, profile link, edit link, and add button remain usable;
- the mobile header and bottom navigation remain unchanged.

**Step 5: Review the final diff and commit any verification fix**

Run:

```bash
git status --short
git diff --check
```

If an in-scope correction was required, rerun the full automated gate and commit only the affected files with a focused Conventional Commit. If no correction was required, leave the working tree clean.
