-- Calendar-week operational totals. The legacy daily RPC remains compatible.
CREATE OR REPLACE FUNCTION public.admin_get_weekly_dashboard_summary(p_reference_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reference timestamptz := COALESCE(p_reference_at, now());
  v_start date := date_trunc('week', v_reference AT TIME ZONE 'America/Lima')::date;
  v_from timestamptz := v_start::timestamp AT TIME ZONE 'America/Lima';
  v_until timestamptz := (v_start + 7)::timestamp AT TIME ZONE 'America/Lima';
  v_reservations integer;
  v_sessions integer;
  v_pending integer;
  v_attendance integer;
  v_slots integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) FILTER(WHERE b.status IN ('reserved','attended','no_show'))::integer,
    count(*) FILTER(WHERE b.intro_client_id IS NOT NULL AND b.status='reserved')::integer,
    count(*) FILTER(WHERE b.status='reserved')::integer
  INTO v_reservations,v_pending,v_attendance
  FROM public.bookings b JOIN public.sessions s ON s.id=b.session_id
  WHERE s.start_at>=v_from AND s.start_at<v_until AND s.status<>'cancelled';

  SELECT count(*)::integer INTO v_sessions FROM public.sessions
  WHERE start_at>=v_from AND start_at<v_until AND status='scheduled';

  -- Keep the configured distance-based capacity; unknown is not the same as zero.
  -- Clamp per session so an overbooked class cannot erase another class's free places.
  WITH capacity AS (
    SELECT s.id,
      COALESCE(sum(ard.targets*4),0) AS total,
      COALESCE(sum(ard.reserved_count),0) AS used
    FROM public.sessions s LEFT JOIN public.admin_roster_by_distance ard ON ard.session_id=s.id
    WHERE s.start_at>=v_from AND s.start_at<v_until AND s.start_at>v_reference AND s.status='scheduled'
    GROUP BY s.id
  )
  SELECT CASE WHEN count(*) FILTER(WHERE total<=0)>0 THEN NULL
    ELSE COALESCE(sum(GREATEST(total-used,0)),0)::integer END
  INTO v_slots FROM capacity;

  RETURN jsonb_build_object('startDate',v_start,'endDate',v_start+6,
    'reservations',v_reservations,'scheduledSessions',v_sessions,'availableSlots',v_slots,
    'pendingConfirmations',v_pending,'attendancePending',v_attendance);
END $$;
REVOKE ALL ON FUNCTION public.admin_get_weekly_dashboard_summary(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_weekly_dashboard_summary(timestamptz) TO authenticated;
COMMENT ON FUNCTION public.admin_get_weekly_dashboard_summary(timestamptz) IS
  'Admin-only Monday-Sunday Lima totals; remaining capacity excludes elapsed sessions. Read only.';
