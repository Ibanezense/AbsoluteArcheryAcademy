BEGIN;

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_membership
  ON public.attendance_reversals(student_membership_id);

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_original_ledger
  ON public.attendance_reversals(original_ledger_id);

CREATE INDEX IF NOT EXISTS idx_attendance_reversals_actor
  ON public.attendance_reversals(reversed_by_profile_id);

COMMIT;
