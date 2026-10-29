-- Suspend automatic generation without deleting projections or annual closures.
DO $$
DECLARE v_job bigint;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='student-birthdays-lima' LOOP
    PERFORM cron.unschedule(v_job);
  END LOOP;
END $$;
-- A full delivery suspension also requires disabling the client and recovery RPC,
-- or returning unavailable birthday fields in the readers. Preserve all closure rows.
