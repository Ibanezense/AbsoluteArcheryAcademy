BEGIN;

DROP INDEX IF EXISTS public.idx_student_credit_ledger_weekly_attendance;

CREATE UNIQUE INDEX idx_student_credit_ledger_weekly_attendance
  ON public.student_credit_ledger(weekly_attendance_id)
  WHERE weekly_attendance_id IS NOT NULL
    AND movement_type = 'weekly_no_show_consumed';

COMMIT;
