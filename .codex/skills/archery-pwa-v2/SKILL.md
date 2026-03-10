---
name: archery-pwa-v2
description: Working guide for the archery academy PWA built with Next.js and Supabase. Use when modifying this repo's V2 domain model, Supabase migrations or RPCs, access-code authentication, or role-based flows for admin, guardian, and student accounts.
---

# Archery Pwa V2

## Overview

Use this skill to keep changes aligned with the academy's business rules and the V2 migration path.
Prefer it when touching `supabase/migrations`, auth flows, booking logic, memberships, payments, or tutor-child behavior.

## Core Rules

- Treat `profiles` as the authenticated account, not as the student record.
- Treat `students` as the academic subject for bookings, memberships, payments, and attendance.
- Keep reservations, balances, and membership state tied to `student_id`, not `profiles.id`.
- Assume all accounts are created by admin. There is no self-signup.
- Keep the access flow centered on `access_code`, while preserving standard Supabase sessions for the app.
- Preserve legacy compatibility unless the task explicitly allows cleanup.

## Workflow

1. Inspect the affected repo files before proposing structural changes.
2. If touching SQL, read `references/domain-model.md` first.
3. If touching login or role routing, read `references/access-and-migration.md` first.
4. Keep migrations idempotent and safe for partially migrated data.
5. Prefer additive changes before destructive cleanup.
6. Verify TypeScript after code changes and call out any untested database behavior.

## Task Guidance

### Schema and RPC changes

- Favor `student_id` access validation through helper functions such as `can_access_student(...)`.
- Keep admin-only writes explicit in RLS and `SECURITY DEFINER` functions.
- When migrating legacy data, preserve compatibility fields until the frontend is moved.

### Auth and account changes

- Do not replace Supabase Auth unless the task explicitly requires it.
- Prefer translating `access_code` into a normal Supabase session so existing guards and hooks keep working.
- Route by role:
  - `admin` -> `/admin`
  - `guardian` -> `/hub`
  - `student` -> `/`

### Frontend changes

- Guardian flows must choose a student context before bookings or student-specific dashboards.
- Avoid reinforcing the old assumption that one logged-in account always equals one student.
- Hide or adapt student-only navigation in `/login` and `/hub`.

## References

- Read [references/domain-model.md](references/domain-model.md) when changing data model, RLS, migrations, memberships, bookings, or parent-child behavior.
- Read [references/access-and-migration.md](references/access-and-migration.md) when changing login, `access_code`, session handling, routing, or transition strategy.
