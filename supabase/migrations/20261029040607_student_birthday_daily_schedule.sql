-- Apply only after explicit activation approval, after the functional migration.
-- pg_cron must already be installed in the target database and run in UTC/GMT.
-- 05:00 UTC is 00:00 America/Lima; no daylight-saving conversion is delegated to the host.
DO $$
DECLARE v_zone text := coalesce(nullif(current_setting('cron.timezone',true),''),'GMT'); v_job bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'pg_cron must be installed before enabling student-birthdays-lima';
  END IF;
  IF v_zone NOT IN ('UTC','GMT','Etc/UTC','Etc/GMT') THEN
    RAISE EXCEPTION 'student-birthdays-lima requires a UTC pg_cron timezone (found %)',v_zone;
  END IF;
  -- Only replace this feature's own job; never affect attendance or other academy jobs.
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='student-birthdays-lima' LOOP
    PERFORM cron.unschedule(v_job);
  END LOOP;
  PERFORM cron.schedule('student-birthdays-lima','0 5 * * *','SELECT public.ensure_student_birthday_day();');
END $$;
