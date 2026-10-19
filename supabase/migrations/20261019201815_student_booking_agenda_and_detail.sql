-- Additive previews only. The existing book_session_multisite remains the atomic authority.
-- Mirror its membership selection exactly; no sync/booking/credit/resource writes are used here.
CREATE OR REPLACE FUNCTION public.get_student_booking_agenda(p_student_id uuid,p_date_from date,p_date_to date)
RETURNS TABLE (
 session_id uuid,start_at timestamptz,end_at timestamptz,status text,already_reserved boolean,
 distance_m integer,bow_usage_type text,spots_for_student integer,location_code text,
 location_name text,location_address text,booking_mode text,can_book boolean,
 eligibility_reason text,eligibility_message text,credit_kind text,eligible_membership_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student_id uuid; v_student public.students; v_can_operate boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
 v_student_id:=public.resolve_accessible_student_id(p_student_id);
 IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to<p_date_from OR p_date_to-p_date_from>31 THEN RAISE EXCEPTION 'Rango de agenda inválido'; END IF;
 SELECT * INTO v_student FROM public.students WHERE id=v_student_id;
 -- sync_student_membership_operational_status would reactivate a non-protected student
 -- only with an already-started, valid cycle with normal/recovery balance. Evaluate it
 -- without running the mutating sync. A future-only cycle leaves the account paused.
 SELECT NOT public.is_student_protected_operational_status(v_student.operational_status) AND EXISTS (
  SELECT FROM public.student_memberships m WHERE m.student_id=v_student_id AND m.status='active'
   AND m.start_date<=(now() AT TIME ZONE 'America/Lima')::date
   AND (m.end_date IS NULL OR m.end_date>=(now() AT TIME ZONE 'America/Lima')::date)
   AND (m.classes_remaining>0 OR EXISTS(SELECT FROM public.membership_recovery_credits r WHERE r.student_membership_id=m.id AND r.classes_remaining>0))
 ) INTO v_can_operate;
 RETURN QUERY
 SELECT s.id,s.start_at,s.end_at,s.status::text,own_booking.reserved,
  v_student.current_distance_m,a.data->>'bow_usage_type',
  GREATEST(LEAST(COALESCE((a.data->>'physical_spots_remaining')::integer,0),
    CASE WHEN a.data->>'bow_usage_type' IN ('shared_inventory','assigned') THEN COALESCE((a.data->>'shared_bows_remaining')::integer,0)
    ELSE COALESCE((a.data->>'physical_spots_remaining')::integer,0) END),0),
  l.code,l.name,l.address,s.booking_mode,
  reason.code='available',reason.code,
  CASE WHEN reason.code='capacity' THEN a.data->>'message' ELSE NULL END,
  selected.credit,selected.id
 FROM public.sessions s
 JOIN public.academy_locations l ON l.id=s.location_id
 CROSS JOIN LATERAL (SELECT (s.start_at AT TIME ZONE 'America/Lima')::date AS day) local_day
 CROSS JOIN LATERAL (SELECT local_day.day-(EXTRACT(ISODOW FROM local_day.day)::integer-1) AS monday) week
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT FROM public.bookings b WHERE b.session_id=s.id AND b.student_id=v_student_id AND b.status='reserved') AS reserved) own_booking
 CROSS JOIN LATERAL (SELECT public.get_multisite_session_availability(s.id,v_student_id,false,NULL) AS data) a
 CROSS JOIN LATERAL (
  WITH cycles AS (
   SELECT sm.id,sm.start_date,sm.created_at,
    EXISTS(SELECT FROM public.membership_freezes f WHERE f.membership_purchase_id=sm.purchase_id AND f.status<>'cancelled' AND local_day.day BETWEEN f.start_date AND f.end_date) AS frozen,
    sm.classes_remaining>(SELECT count(*) FROM public.bookings b WHERE b.active_membership_id=sm.id AND b.credit_kind='normal' AND (b.status='reserved' OR EXISTS(SELECT FROM public.booking_cancellations bc WHERE bc.booking_id=b.id AND bc.review_status='pending'))) AS normal_available,
    (sm.weekly_class_target=0 OR (SELECT count(*) FROM public.bookings b JOIN public.sessions ws ON ws.id=b.session_id WHERE b.active_membership_id=sm.id AND b.credit_kind='normal' AND (ws.start_at AT TIME ZONE 'America/Lima')::date BETWEEN week.monday AND week.monday+6 AND (b.status IN ('reserved','attended','no_show') OR EXISTS(SELECT FROM public.booking_cancellations bc WHERE bc.booking_id=b.id AND (bc.review_status='pending' OR bc.resolution='no_show'))))<sm.weekly_class_target) AS quota_available,
    EXISTS(SELECT FROM public.membership_recovery_credits r WHERE r.student_membership_id=sm.id AND r.classes_remaining>(SELECT count(*) FROM public.bookings b WHERE b.recovery_credit_id=r.id AND (b.status='reserved' OR EXISTS(SELECT FROM public.booking_cancellations bc WHERE bc.booking_id=b.id AND bc.review_status='pending')))) AS recovery_available
   FROM public.student_memberships sm
   WHERE sm.student_id=v_student_id AND sm.status='active' AND sm.start_date<=local_day.day AND (sm.end_date IS NULL OR sm.end_date>=local_day.day)
  ), eligible AS (
   SELECT c.id,CASE WHEN c.normal_available AND c.quota_available THEN 'normal' ELSE 'recovery' END AS credit
   FROM cycles c WHERE NOT c.frozen AND ((c.normal_available AND c.quota_available) OR c.recovery_available)
   ORDER BY c.start_date,c.created_at,c.id LIMIT 1
  )
  SELECT (SELECT e.id FROM eligible e) AS id,(SELECT e.credit FROM eligible e) AS credit,
   CASE WHEN NOT EXISTS(SELECT FROM cycles) THEN 'membership_dates'
    WHEN NOT EXISTS(SELECT FROM cycles c WHERE NOT c.frozen) THEN 'frozen'
    WHEN EXISTS(SELECT FROM cycles c WHERE NOT c.frozen AND c.normal_available AND NOT c.quota_available) THEN 'weekly_limit'
    ELSE 'no_balance' END AS missing_reason
 ) selected
 CROSS JOIN LATERAL (
  SELECT CASE WHEN own_booking.reserved THEN 'already_reserved'
   WHEN s.start_at<=now() THEN 'past'
   WHEN now()>=s.start_at-interval '2 hours' THEN 'cutoff'
   WHEN public.is_student_protected_operational_status(v_student.operational_status) THEN 'student_inactive'
   WHEN v_student.current_distance_m IS NULL THEN 'distance_missing'
   WHEN selected.id IS NULL THEN selected.missing_reason
   WHEN NOT v_can_operate THEN 'student_inactive'
   WHEN NOT COALESCE((a.data->>'available')::boolean,false) THEN 'capacity'
   ELSE 'available' END AS code
 ) reason
 WHERE l.code='tiabaya' AND s.booking_mode='flexible' AND s.status='scheduled'
  AND s.start_at>now() AND local_day.day BETWEEN p_date_from AND p_date_to
 ORDER BY s.start_at,s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_booking_detail(p_booking_id uuid,p_student_id uuid)
RETURNS TABLE (
 booking_id uuid,student_id uuid,student_name text,status text,group_type text,distance_m integer,
 bow_usage_type text,bow_poundage integer,start_at timestamptz,end_at timestamptz,
 location_name text,location_address text,booking_mode text,cancellation_source text,
 cancellation_resolution text,cancellation_review_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
 v_student_id:=public.resolve_accessible_student_id(p_student_id);
 RETURN QUERY SELECT b.id,b.student_id,st.full_name,b.status::text,b.group_type::text,b.distance_m,
  b.bow_usage_type,b.bow_poundage,s.start_at,s.end_at,l.name,l.address,s.booking_mode,
  bc.cancellation_source,bc.resolution,bc.review_status
 FROM public.bookings b JOIN public.students st ON st.id=b.student_id
 JOIN public.sessions s ON s.id=b.session_id LEFT JOIN public.academy_locations l ON l.id=s.location_id
 LEFT JOIN public.booking_cancellations bc ON bc.booking_id=b.id
 WHERE b.id=p_booking_id AND b.student_id=v_student_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_booking_agenda(uuid,date,date),public.get_student_booking_detail(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_booking_agenda(uuid,date,date),public.get_student_booking_detail(uuid,uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_student_booking_agenda(uuid,date,date) IS 'Read-only eligibility preview matching date, quota, reserved commitments, recovery, freeze, capacity and per-session cutoff. Booking RPC revalidates atomically.';
