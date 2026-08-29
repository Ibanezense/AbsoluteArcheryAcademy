# Manual Student Inactive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a secure, reversible admin action that persists a student's manual inactive operational state while keeping the login account enabled.

**Architecture:** A dedicated admin-only Supabase RPC owns the state transition and protects `inactive` from automatic membership synchronization. A small client service calls the RPC, while the existing student profile action menu confirms the transition and invalidates shared student caches.

**Tech Stack:** Next.js 14, React, TypeScript, React Query, Supabase PostgreSQL, Vitest.

---

### Task 1: Define the database contract

**Files:**
- Create: `supabase/migrations/<generated>_admin_manual_student_inactive.sql`
- Create: `tests/supabase/adminManualStudentInactive.test.ts`

1. Write a failing test requiring `inactive` in the status constraint and protected-state helper, plus an admin-only `admin_set_student_inactive(uuid, boolean)` RPC.
2. Run the focused test and confirm it fails because the migration is absent.
3. Generate the migration using `npx supabase migration new admin_manual_student_inactive`.
4. Implement the minimal idempotent SQL contract with fixed `search_path`, authentication/authorization checks, explicit ACLs, no profile update, and membership-derived recalculation on reactivation.
5. Run the focused test and confirm it passes.

### Task 2: Add the client service

**Files:**
- Create: `lib/services/adminStudentOperationalStatusService.ts`
- Create: `lib/services/adminStudentOperationalStatusService.test.ts`

1. Write failing tests for exact RPC payload, valid response, Supabase errors, and malformed response.
2. Run tests to confirm the expected RED failures.
3. Implement the typed RPC wrapper and strict response validation.
4. Run tests to confirm GREEN.

### Task 3: Add the profile action

**Files:**
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Create: `tests/app/adminManualStudentInactive.test.ts`
- Modify: `tests/app/adminAlumnoDetailCacheInvalidation.test.ts`

1. Write failing source-contract tests for both labels, confirmation, service call, busy state, and shared cache invalidation.
2. Run tests and confirm they fail because the action is missing.
3. Add the handler and conditional menu action using the existing confirmation/toast systems.
4. Ensure block/access behavior remains separate and `profiles.is_active` is not changed by the manual inactive action.
5. Run focused tests to confirm GREEN.

### Task 4: Verify and release

1. Run focused tests, full `npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, and `git diff --check`.
2. Commit the implementation with a Conventional Commit message.
3. Apply the exact migration to linked Supabase and verify ACLs plus rollback-only transition smoke tests.
4. Fast-forward the verified branch into `main`, rerun the release gate, and push `origin/main`.
5. Wait for the matching Vercel deployment, verify commit SHA, `READY`, production HTTP 200, and clean logs.
