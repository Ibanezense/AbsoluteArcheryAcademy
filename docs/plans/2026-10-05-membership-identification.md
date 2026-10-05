# Membership identification implementation plan

**Goal:** Identify every membership cycle and show the exact cycle responsible for each attendance or no-show.

**Architecture:** Add an immutable, unique automatic code to student_memberships. Keep existing UUID links as the source of attribution. Show code and validity in the administrative profile, add a membership filter and per-cycle balances. Flag unresolved legacy events instead of inferring ownership from dates.

**Tech Stack:** Next.js, React, TypeScript, Supabase PostgreSQL, Vitest.

## Task 1: Database identity

- Create a migration using the Supabase CLI.
- Backfill existing cycles with MEM-year-sequence codes. Use a sequence for concurrent inserts and a trigger to prevent changes.
- Preserve existing attendance links. Recover missing links only from a unique matching debit in the ledger.
- Validate new student attendance links and prevent reassignment after credit consumption; exempt intro reservations.
- Verify uniqueness, automatic generation, immutability and permission behavior in a rolled-back database transaction.

## Task 2: Attendance attribution

- Modify lib/hooks/useStudentDetail.ts to read membership_code and credit_kind.
- Add helpers and behavioral tests in lib/utils/studentAttendanceHistory.ts and its test file for exact-cycle labels, filters, recovery and unresolved legacy records.
- Modify app/admin/alumnos/[id]/page.tsx to show code and validity in memberships and every attendance row, filter by cycle and show cycle balances separately from recovery usage.
- Preserve reversal behavior and refresh.

## Task 3: Release verification

- Run npm test, npm run lint and npm run build with local environment configuration.
- Inspect the complete diff, apply the additive migration and verify live database invariants without changing student balances.
- Commit, integrate main, deploy production and verify deployment and public routes.
