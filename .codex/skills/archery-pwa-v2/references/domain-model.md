# Domain Model

## Canonical separation

- `profiles`: authenticated account
- `students`: real student
- `student_guardians`: one guardian account can manage multiple students
- `student_memberships`: membership history and current validity
- `student_membership_payments`: payment record with dates and rewards
- `student_credit_ledger`: balance movement audit
- `bookings.student_id`: booking belongs to student, not directly to account

## Role rules

- `admin`: creates accounts, manages students, memberships, bookings, attendance, and payments
- `guardian`: can view and operate on linked students
- `student`: can operate on self-linked student

`coach` is deprecated in V2 and should not be used for new logic.

## Access rules

- `can_access_student(student_id)` is the preferred rule for student-scoped reads
- guardian access comes from `student_guardians.guardian_profile_id`
- admin access should stay explicit

## Data ownership rules

- memberships, balances, bookings, attendance, and payments belong to `students`
- `profiles` may temporarily keep legacy fields, but they are not the long-term source of truth

## Migration rules

- keep legacy columns and flows until the frontend is moved
- make migrations idempotent where possible
- preserve existing UUID relationships during backfill
- prefer additive migrations before cleanup migrations
