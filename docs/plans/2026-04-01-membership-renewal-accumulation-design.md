# Membership Renewal Accumulation Design

## Goal

Fix membership renewals so new classes accumulate on top of an active membership instead of replacing the pending balance.

## Decisions

- Keep a single active membership per student.
- When admin sells a plan to a student with an active membership, renew the same `student_memberships` row instead of creating a new one.
- Accumulate the new plan credits into the active row:
  - `classes_total += classes_included`
  - `classes_remaining += classes_included`
- Preserve existing bookings and their `active_membership_id`.
- Register the renewal as a ledger movement and optional payment on the same membership.
- Extend the membership validity without shortening the current validity window.

## Scope

### Included

- Update the admin renewal RPC in Supabase
- Add a focused regression test that locks the renewal contract
- Update admin copy so the UI reflects accumulation behavior
- Refresh the recent memberships list so renewed rows still surface

### Not Included

- Supporting multiple active memberships
- Reworking booking ownership across memberships
- Reconstructing historical split-per-renewal membership rows

## Data Model

The system already ties bookings and credit refunds to `bookings.active_membership_id`. Reusing the same active membership row is the lowest-risk fix because future bookings, cancellations, class cards, and dashboards keep pointing to the same membership id.

For renewals on an active membership:

- keep `status = 'active'`
- keep the current row id
- update `membership_plan_id` and `custom_name` to the latest sold plan
- update `end_date` to the furthest applicable date
- add a `membership_renewal` ledger movement

For students without an active membership, keep the current activation flow that creates a new row.

## UX Impact

Admin copy in `/admin/membresias` should no longer say that the previous active membership becomes historical during renewal. It should explain that active balances accumulate.

The recent memberships panel should order by `updated_at` so a renewed membership still appears as a recent commercial action.

## Testing

Minimum coverage:

- a regression test proving the renewal migration reuses the active membership row and accumulates credits
- targeted Vitest run for that test
- lint after the implementation

## Risks

- If the RPC still forces the old row to `historical`, refunds for existing bookings can break again.
- If renewal updates `end_date` incorrectly, an early renewal could shorten an already-valid membership.
- If the UI text is not updated, admin behavior will change without explanation.
