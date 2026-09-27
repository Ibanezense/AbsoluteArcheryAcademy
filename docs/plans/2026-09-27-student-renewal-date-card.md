# Student Renewal Date Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the student home membership-expiry wording with a renewal date whose color warns during the final seven days and after expiration.

**Architecture:** Add a pure date-state helper that compares ISO membership dates against the Lima calendar day, then pass its label, value, detail color, and icon tone into the existing `QuickMetric`. Keep `membership_end` as the only data source and avoid database changes.

**Tech Stack:** Next.js 14, React, TypeScript, Day.js, Tailwind CSS, Vitest.

---

### Task 1: Define renewal date states

**Files:**
- Create: `lib/utils/studentRenewalDate.ts`
- Create: `lib/utils/studentRenewalDate.test.ts`

**Step 1: Write the failing tests**

Cover these cases with a fixed Lima reference date:

```ts
expect(getStudentRenewalDateState('2026-10-10', '2026-09-27')).toMatchObject({ tone: 'green' })
expect(getStudentRenewalDateState('2026-10-04', '2026-09-27')).toMatchObject({ tone: 'orange' })
expect(getStudentRenewalDateState('2026-09-27', '2026-09-27')).toMatchObject({ tone: 'orange' })
expect(getStudentRenewalDateState('2026-09-26', '2026-09-27')).toMatchObject({ tone: 'red' })
expect(getStudentRenewalDateState(null, '2026-09-27')).toMatchObject({ tone: 'neutral', value: 'Sin fecha' })
```

Also assert that valid dates use the short Spanish display format and that the helper returns the label `Renovación`.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- lib/utils/studentRenewalDate.test.ts`

Expected: FAIL because `studentRenewalDate.ts` does not exist.

**Step 3: Implement the minimal helper**

Create a pure function that:

- Accepts `membershipEnd: string | null` and an optional Lima date key.
- Uses date-only comparison so the result does not change due to UTC conversion.
- Returns `green` for more than seven days, `orange` for zero through seven days, `red` below zero, and `neutral` without a valid date.
- Returns `Renovación`, the formatted value, and a short detail message.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- lib/utils/studentRenewalDate.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/utils/studentRenewalDate.ts lib/utils/studentRenewalDate.test.ts
git commit -m "feat(student): classify membership renewal date"
```

### Task 2: Render renewal status on the student home

**Files:**
- Modify: `app/page.tsx`
- Create: `tests/app/studentRenewalDateCard.test.ts`

**Step 1: Write the failing surface test**

Assert that the student home:

- Imports and calls `getStudentRenewalDateState` with `dashboard.membership_end`.
- Uses `label={renewalDate.label}` and the returned value/detail.
- Supports `red` and `neutral` tones in `QuickMetric`.
- No longer renders `detail="Vencimiento"` for this card.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/app/studentRenewalDateCard.test.ts`

Expected: FAIL because the home still renders `Vence` and `Vencimiento`.

**Step 3: Implement the card update**

- Replace the local `membershipEnd` formatting with the helper result.
- Pass the helper state to `QuickMetric`.
- Extend `QuickMetric` tones with restrained red and neutral styles matching the existing visual system.
- Apply the state color to the icon, date, and detail text while leaving unrelated cards unchanged.

**Step 4: Run focused tests**

Run: `npm test -- lib/utils/studentRenewalDate.test.ts tests/app/studentRenewalDateCard.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/page.tsx tests/app/studentRenewalDateCard.test.ts
git commit -m "feat(student): highlight membership renewal date"
```

### Task 3: Verify and integrate

**Files:**
- Verify all changed files.

**Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests pass.

**Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0.

**Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0.

**Step 4: Review the diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only planned files changed.

**Step 5: Integrate and deploy**

Merge the feature branch into `main`, push `main`, wait for the Vercel production deployment, and verify the production route responds successfully without new runtime errors.
