# Hide WhatsApp For Inactive Students Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep membership renewal alerts visible while hiding their WhatsApp action for students whose displayed operational status is paused or inactive.

**Architecture:** The shared `MembershipRenewalAlertAction` receives the canonical displayed operational status and centrally decides whether communication controls may render. List callers pass `getAdminStudentStatus(student)` and the detail caller passes its already-computed `operationalStatus`, keeping desktop, mobile, and detail behavior aligned.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest.

---

### Task 1: Add regression coverage

**Files:**
- Modify: `tests/app/adminMembershipRenewalWhatsApp.test.ts`

**Step 1: Write the failing tests**

Render the shared action with `paused` and `inactive` statuses and assert that the renewal label remains visible while the WhatsApp link and missing-phone fallback are absent. Assert that list and detail callers supply their canonical displayed status.

**Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/app/adminMembershipRenewalWhatsApp.test.ts`

Expected: FAIL because the component ignores operational status and callers do not supply it.

### Task 2: Implement the centralized visibility rule

**Files:**
- Modify: `components/admin/MembershipRenewalAlertAction.tsx`
- Modify: `app/admin/alumnos/page.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Add the required operational status prop**

Type it as `StudentOperationalStatus` and suppress communication controls only for `paused` and `inactive`.

**Step 2: Supply canonical status from every caller**

Use `getAdminStudentStatus(student)` in both list renderers and `operationalStatus` in the detail page.

**Step 3: Run the focused test to verify it passes**

Run: `npm test -- tests/app/adminMembershipRenewalWhatsApp.test.ts`

Expected: PASS.

### Task 3: Verify and release

**Files:**
- Verify all modified files.

**Step 1: Run verification**

Run: `npm test`, `npm run lint`, and `npm run build`.

Expected: all commands exit successfully.

**Step 2: Commit and integrate**

Commit only the plan, tests, component, and caller changes using a Conventional Commit; merge into `main`, re-run the full gate, push `main`, and verify the production deployment.
