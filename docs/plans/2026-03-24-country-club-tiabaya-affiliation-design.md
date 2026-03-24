# Country Club Tiabaya Affiliation Design

## Goal

Add a simple way to mark whether a student belongs to Country Club Tiabaya, surface that status in admin student flows, and expose a dashboard KPI for active CCT students.

## Decisions

- Store the affiliation on `public.students`, not `profiles`.
- Model it as a boolean field with a safe default:
  - `is_country_club_tiabaya_member boolean not null default false`
- Allow admins to set and update the field from the student editor.
- Show a short visual badge in the admin student list:
  - label: `CCT`
  - style: green badge for quick scanning
- Add a new dashboard KPI:
  - label: `Alumnos CCT activos`
  - logic: count only students where `is_active = true` and `is_country_club_tiabaya_member = true`

## Scope

### Included

- Additive Supabase migration for the `students` table
- Update the admin create and edit student flow
- Update student detail loading to include the new field
- Update the student list UI to show the green `CCT` badge
- Extend `get_dashboard_stats()` and dashboard client types/UI

### Not Included

- Historical affiliation tracking
- Multiple club sources
- Club-based filters or advanced reporting
- Changes to guardian or student-facing flows

## Data Model

The affiliation belongs to the student domain model because it describes the student as the academy subject, not the authenticated account. This keeps the change aligned with the V2 rule that operational and academic data stays on `students`.

Migration requirements:

- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Backfill safely through the default value
- Keep the migration idempotent

## Admin UX

### Student create/edit form

- Add a checkbox with the full label:
  - `Afiliado al Country Club Tiabaya`
- Default unchecked for new students
- Load and persist the current value for existing students

### Student list

- Render a green badge `CCT` on each student card when the flag is true
- Render nothing when the flag is false
- Keep the badge compact so it does not dominate the card layout

## API and Data Flow

The existing `/api/admin/create-student` route already handles both create and update. The new boolean should be added to:

- the request payload type
- the `studentRowFromPayload(...)` normalization
- create inserts into `students`
- update writes to `students`
- student detail reads used by the editor

## Dashboard

The admin dashboard should expose the new KPI through the existing `get_dashboard_stats()` RPC response. The RPC remains the source of truth for the count.

Expected JSON addition:

```json
{
  "alumnos_cct_activos": 0
}
```

## Testing

Minimum verification:

- API test covering create/update payload persistence for the new boolean
- Dashboard or hook-level test covering the new KPI field mapping
- Lint and targeted tests after implementation

## Risks

- Forgetting to include the field in the student detail query would make edit mode silently reset the checkbox.
- Forgetting the default in SQL would make existing rows ambiguous.
- Adding the badge without loading the field in the list query would create UI inconsistency.
