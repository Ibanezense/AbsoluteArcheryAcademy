# Recurring Intro Schedules by Location Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let administrators configure recurring trial-class schedules per location and require location-first selection when registering or rescheduling a trial class.

**Architecture:** `weekly_session_templates` remains the canonical schedule and gains an `allows_intro` flag. Availability and booking RPCs enforce that the selected session belongs to an active intro-enabled template, while the admin UI edits the same templates grouped by location. The registration UI selects a location first and then filters server-calculated sessions with real resource capacity.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, TanStack Query, Tailwind CSS, Supabase/PostgreSQL, Vitest.

---

### Task 1: Add the recurring intro-schedule contract

**Files:**
- Create: `tests/supabase/introSchedulesByLocation.test.ts`
- Create: `supabase/migrations/20260921154000_recurring_intro_schedules_by_location.sql`

**Step 1: Write the failing schema and backfill tests**

Assert that the migration:

- adds `weekly_session_templates.allows_intro boolean NOT NULL DEFAULT false`;
- enables active Saturday/Sunday Tiabaya templates used by the current trial flow;
- enables active Wednesday-Friday Umacollo templates;
- leaves inactive Umacollo Tuesday templates disabled;
- keeps `location_id` mandatory;
- creates no second schedule table.

**Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/supabase/introSchedulesByLocation.test.ts`

Expected: FAIL because the migration does not exist.

**Step 3: Create the migration through the Supabase CLI**

Run: `npx supabase migration new recurring_intro_schedules_by_location`

Implement the additive column and deterministic backfill. Use location code plus weekday and active status; do not match UUIDs or names manually.

**Step 4: Add an admin-only transactional template RPC**

In the same migration, create `admin_upsert_weekly_template(...)` that accepts:

```sql
p_template_id uuid DEFAULT NULL,
p_location_id uuid,
p_label text,
p_weekday smallint,
p_start_time time,
p_end_time time,
p_is_active boolean,
p_allows_intro boolean,
p_distances jsonb
```

The RPC must:

- verify `auth.uid()` and `is_admin_user()`;
- validate location, weekday, time order and at least one positive distance allocation;
- insert or update the template and its distances in one transaction;
- default `booking_mode` from the location (`fixed` for Umacollo, `flexible` for Tiabaya);
- preserve existing template capacity fields when editing;
- seed the location’s standard equipment allocation when creating a template: Tiabaya `2×18 lb + 6×20 lb`, Umacollo `2×18 lb + 2×20 lb`;
- return the saved template ID;
- revoke access from `PUBLIC` and `anon`, granting only `authenticated` and `service_role`.

**Step 5: Add server-side intro eligibility helpers**

Create an internal helper such as:

```sql
public.session_accepts_intro(p_session_id uuid)
```

It returns true only when the session is scheduled, its location is active/open, and its linked template is active with `allows_intro = true`. Restrict direct execution if it is `SECURITY DEFINER`.

**Step 6: Run tests and parse the migration**

Run:

```powershell
npm test -- tests/supabase/introSchedulesByLocation.test.ts
python -c "from pathlib import Path; from pglast import parse_sql; parse_sql(Path('supabase/migrations/20260921154000_recurring_intro_schedules_by_location.sql').read_text(encoding='utf-8')); print('SQL_PARSE_OK')"
```

Expected: all focused tests pass and `SQL_PARSE_OK` is printed.

**Step 7: Commit**

```powershell
git add tests/supabase/introSchedulesByLocation.test.ts supabase/migrations/20260921154000_recurring_intro_schedules_by_location.sql
git commit -m "feat(intro): add recurring schedules by location"
```

### Task 2: Restrict intro availability and booking in PostgreSQL

**Files:**
- Modify: `tests/supabase/introSchedulesByLocation.test.ts`
- Modify: `supabase/migrations/20260921154000_recurring_intro_schedules_by_location.sql`
- Create: `supabase/tests/intro_schedules_by_location_transactional.sql`

**Step 1: Add failing RPC contract tests**

Assert that `get_available_intro_sessions`:

- accepts an optional location filter while keeping the existing two-argument call compatible;
- joins the session to its weekly template;
- requires `template.is_active` and `template.allows_intro`;
- retains the current physical-space and shared-bow calculation;
- returns location code, name and address.

Assert that both `admin_register_intro_class` and `admin_update_intro_class` call `session_accepts_intro` while holding the relevant session row lock. Updating without changing sessions may preserve the current booking; changing sessions must validate the new target.

**Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/supabase/introSchedulesByLocation.test.ts`

Expected: FAIL on missing eligibility checks and location parameter.

**Step 3: Override the availability RPC**

Add a three-argument overload:

```sql
get_available_intro_sessions(
  p_date_from date,
  p_date_to date,
  p_location_id uuid DEFAULT NULL
)
```

Keep a two-argument wrapper for older clients. Filter by `p_location_id` when supplied and order by date, location and start time.

**Step 4: Harden registration and update RPCs**

Preserve existing payment, capacity and audit behavior. Add the intro-template eligibility check before inserting or moving the booking. Do not weaken resource-claim validation.

**Step 5: Add rollback-only transactional scenarios**

Cover:

- intro-enabled Tiabaya and Umacollo sessions returned by location;
- non-enabled sessions omitted;
- registration rejected after the template is disabled;
- reprogramming rejected to a non-enabled session;
- two concurrent attempts cannot exceed the final space or shared bow;
- an existing booking remains valid after its template is disabled.

End the SQL scenario with `ROLLBACK;`.

**Step 6: Run focused database tests**

Run:

```powershell
npm test -- tests/supabase/introSchedulesByLocation.test.ts tests/supabase/equipmentBasedCapacity.test.ts tests/supabase/atomicIntroAndSessionRpcs.test.ts
```

Expected: PASS.

**Step 7: Commit**

```powershell
git add tests/supabase/introSchedulesByLocation.test.ts supabase/migrations/20260921154000_recurring_intro_schedules_by_location.sql supabase/tests/intro_schedules_by_location_transactional.sql
git commit -m "fix(intro): enforce location schedule eligibility"
```

### Task 3: Persist location and intro availability from Infrastructure settings

**Files:**
- Create: `lib/infrastructureQueries.test.ts`
- Modify: `lib/infrastructureQueries.ts`
- Modify: `app/admin/ajustes/infraestructura/InfraestructuraClientPage.tsx`
- Create: `tests/app/adminIntroScheduleSettings.test.ts`

**Step 1: Write failing service tests**

Test that `UpsertWeeklyTemplateData` and its mutation send:

```ts
{
  locationId,
  label,
  weekday,
  startTime,
  endTime,
  isActive,
  allowsIntro,
  distances,
}
```

to `admin_upsert_weekly_template`, and invalidate both template and intro-session query keys.

**Step 2: Run focused tests and confirm RED**

Run: `npm test -- lib/infrastructureQueries.test.ts tests/app/adminIntroScheduleSettings.test.ts`

Expected: FAIL because the service still performs partial direct writes and the UI has no location/intro controls.

**Step 3: Replace partial template writes with the RPC**

Update the template types with `allows_intro`. Require `location_id` for create and update. Normalize the RPC response and invalidate:

- `['weekly-session-templates']`;
- the shared intro availability query key;
- admin session lists where applicable.

**Step 4: Add the grouped intro schedule settings**

In `InfraestructuraClientPage`:

- group templates by Tiabaya and Umacollo;
- show location badges on every template;
- add `Acepta clases de prueba` to each card;
- add a location selector and intro checkbox to create/edit forms;
- reset location-sensitive defaults when location changes;
- retain the existing distance editor;
- show a clear empty state per location.

Use the existing Tailwind visual system and keep controls usable on mobile.

**Step 5: Support adding a new day**

The existing `Agregar plantilla` action must create a normal recurring template associated with the chosen location. On success, offer or invoke the existing session-generation operation for the next five weeks without creating duplicates.

**Step 6: Run focused tests**

Run: `npm test -- lib/infrastructureQueries.test.ts tests/app/adminIntroScheduleSettings.test.ts`

Expected: PASS.

**Step 7: Commit**

```powershell
git add lib/infrastructureQueries.ts lib/infrastructureQueries.test.ts app/admin/ajustes/infraestructura/InfraestructuraClientPage.tsx tests/app/adminIntroScheduleSettings.test.ts
git commit -m "feat(admin): configure intro schedules by location"
```

### Task 4: Add location-first trial registration

**Files:**
- Modify: `lib/services/IntroClassesService.ts`
- Modify: `lib/services/IntroClassesService.test.ts`
- Modify: `app/admin/intro/components/RegisterIntroModal.tsx`
- Create: `tests/app/adminIntroLocationSelection.test.ts`

**Step 1: Write failing service tests**

Test that `getAvailableSessions(daysAhead, locationId)` sends `p_location_id`, preserves location metadata, and rejects malformed availability rows rather than silently showing an unsafe option.

**Step 2: Write failing UI contract tests**

Assert that the registration modal:

- renders active location choices before the schedule selector;
- loads schedules for the selected location;
- clears `sessionId` when location changes;
- disables confirmation until both location and session are chosen;
- shows date, hour, duration, location and remaining spots;
- shows a location-specific empty state.

**Step 3: Run tests and confirm RED**

Run:

```powershell
npm test -- lib/services/IntroClassesService.test.ts tests/app/adminIntroLocationSelection.test.ts
```

Expected: FAIL on missing location filter and controls.

**Step 4: Implement the service filter**

Add the optional location argument and a stable query key for availability. Continue using Lima dates and the server-calculated `spots_remaining`.

**Step 5: Implement location-first selection**

Render Tiabaya and Umacollo as large selectable controls. Do not preselect a schedule. After choosing a location, load and group available sessions by date. Reset the chosen session whenever the location changes.

**Step 6: Handle stale capacity**

If registration fails because the session was disabled or filled, keep the prospect/payment fields, clear only the session, reload availability and show the server error.

**Step 7: Run focused tests**

Run:

```powershell
npm test -- lib/services/IntroClassesService.test.ts tests/app/adminIntroLocationSelection.test.ts tests/app/adminIntroProductivityPhase3B.test.ts
```

Expected: PASS.

**Step 8: Commit**

```powershell
git add lib/services/IntroClassesService.ts lib/services/IntroClassesService.test.ts app/admin/intro/components/RegisterIntroModal.tsx tests/app/adminIntroLocationSelection.test.ts
git commit -m "feat(intro): select location before trial schedule"
```

### Task 5: Apply the same rules when editing trial bookings

**Files:**
- Modify: `app/admin/intro/IntroClient.tsx`
- Modify: `tests/app/adminIntroLocationSelection.test.ts`
- Modify: `lib/services/IntroClassesService.ts`
- Modify: `lib/services/IntroClassesService.test.ts`

**Step 1: Add failing edit-flow tests**

Cover:

- the current location is derived from the current session;
- the current session remains visible even when no longer intro-enabled;
- selecting another location clears the selected session;
- reprogramming only offers enabled sessions in the new location;
- saving without changing the session remains allowed.

**Step 2: Run tests and confirm RED**

Run: `npm test -- tests/app/adminIntroLocationSelection.test.ts lib/services/IntroClassesService.test.ts`

Expected: FAIL on the missing edit behavior.

**Step 3: Implement edit behavior**

Include location metadata in `IntroSessionGroup` and `IntroClientRow`. Merge the current session into the available list only for the current location, label it as the current assignment and prevent it from being mistaken for a newly available slot.

**Step 4: Invalidate all affected views**

After register or update, refresh:

- the intro agenda;
- available intro sessions;
- weekend trial capacity;
- session/roster queries.

**Step 5: Run focused tests**

Run: `npm test -- tests/app/adminIntroLocationSelection.test.ts lib/services/IntroClassesService.test.ts tests/app/adminWeekendIntroCapacityInvalidation.test.ts`

Expected: PASS.

**Step 6: Commit**

```powershell
git add app/admin/intro/IntroClient.tsx tests/app/adminIntroLocationSelection.test.ts lib/services/IntroClassesService.ts lib/services/IntroClassesService.test.ts
git commit -m "feat(intro): reprogram trials across locations"
```

### Task 6: Verify, migrate and deploy

**Files:**
- Review all files changed in Tasks 1-5.

**Step 1: Run the complete automated suite**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests pass, lint exits `0`, production build exits `0`.

**Step 2: Validate migration history and dry-run**

Run `npx supabase migration list` and use an isolated Supabase staging directory if the repository’s legacy migration history differs from production. Dry-run must list only the new migration.

**Step 3: Apply the production migration**

Push only the approved new migration. Verify:

- Tiabaya and Umacollo intro-enabled template counts;
- Tuesday Umacollo remains disabled;
- the availability RPC returns only enabled templates;
- current intro bookings remain linked and visible;
- no duplicate future sessions were created.

**Step 4: Verify the browser flow**

On mobile and desktop:

- open `Configuración → Infraestructura`;
- toggle an intro schedule and confirm persistence after refresh;
- register a trial in Tiabaya;
- register a trial in Umacollo;
- change location and confirm the previous schedule clears;
- edit an existing trial without moving it;
- confirm full-capacity sessions disappear or are rejected safely.

**Step 5: Review branch changes**

Run:

```powershell
git status --short
git diff --check
git log --oneline main..HEAD
```

Confirm that `output/`, `tmp/`, environment files and unrelated user changes are untouched.

**Step 6: Integrate and deploy**

Merge the branch into `main`, push `main`, wait for the Vercel production deployment to reach `Ready`, and verify HTTP `200` for `/admin/intro` and `/admin/ajustes/infraestructura`.

**Step 7: Report evidence**

Provide the final commit, production URL, migration version, automated test totals and the verified Tiabaya/Umacollo flows.

