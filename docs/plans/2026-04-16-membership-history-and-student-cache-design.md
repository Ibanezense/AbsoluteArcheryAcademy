# Membership History And Student Cache Design

## Goal

Restore the academy rule that each new membership starts a fresh cycle of classes, while also making student edits refresh immediately without a manual page reload.

## Decisions

- Selling a new membership creates a new active `student_memberships` row.
- Any previously active membership becomes `historical`.
- No credits, bookings, or used classes are moved into the new membership.
- Historical memberships keep all prior class cards and booking history, including `reserved`, `attended`, and `no_show`.
- The new membership starts with only the new plan credits.
- Saving a student from the admin editor must invalidate both the student detail cache and the student list cache.

## Scope

### Included

- New Supabase migration overriding `admin_assign_membership_plan(...)`
- Consolidated SQL update
- Admin memberships copy update
- Admin student editor cache invalidation fix
- Regression tests for both contracts

### Not Included

- Migrating future bookings from the old membership to the new one
- Automatic transfer of pending unused credits
- Reworking the class cards data model

## Membership Behavior

The old membership should become historical as-is. This means:

- completed classes stay attached to the old membership
- no-show classes stay attached to the old membership
- reserved future classes also stay attached to the old membership
- the new membership is a clean slate

This matches the operational rule that if the academy wants extra classes on the new cycle, the admin will create them explicitly through the new membership instead of inheriting pending credits.

## UI Impact

The admin memberships page must stop describing renewals as accumulated credits. It should explain that creating a new membership closes the previous active one and starts a fresh class cycle.

The student editor must refresh its own query and the shared students cache after a successful save so the detail page and list view stay in sync immediately.

## Testing

Minimum coverage:

- a SQL regression test that requires the new membership assignment migration to move previous active memberships to `historical` and insert a fresh active row
- a source-level regression test that requires the student editor to invalidate `studentKeys.all` and `studentKeys.detail(id)`

## Risks

- Cancelling a future booking tied to the historical membership will continue to follow the historical membership rules; that is consistent with the new business rule but should be considered intentional.
- If the editor only refetches the local query without invalidating the list cache, the student list will remain stale.
