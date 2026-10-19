-- Read-only student history: totals do not depend on the selected page or filters.
CREATE OR REPLACE FUNCTION public.student_get_booking_history(
  p_student_id uuid DEFAULT NULL, p_scope text DEFAULT 'history', p_month date DEFAULT NULL,
  p_status text DEFAULT 'all', p_page integer DEFAULT 1, p_page_size integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_student uuid;
  v_membership uuid;
  v_result jsonb;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student := public.resolve_accessible_student_id(p_student_id);
  IF p_scope IS NULL OR p_scope NOT IN ('history','upcoming') OR p_status IS NULL
    OR p_status NOT IN ('all','reserved','attended','cancelled','no_show','expired_unattended')
    OR p_page IS NULL OR p_page < 1 OR p_page > 1000000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'Filtros o paginación inválidos';
  END IF;
  -- Same deterministic selector as get_student_dashboard, without its synchronizing writes.
  SELECT m.id INTO v_membership FROM public.student_memberships m
  WHERE m.student_id=v_student AND m.status='active' AND m.start_date<=v_today
    AND (m.end_date IS NULL OR m.end_date>=v_today)
  ORDER BY m.start_date,m.created_at,m.id LIMIT 1;
  IF v_membership IS NULL THEN
    SELECT m.id INTO v_membership FROM public.student_memberships m
    WHERE m.student_id=v_student AND ((m.status='active' AND m.start_date>v_today) OR m.status IN ('expired','historical'))
    ORDER BY CASE WHEN m.status='active' AND m.start_date>v_today THEN 0 ELSE 1 END,
      CASE WHEN m.status='active' AND m.start_date>v_today THEN m.start_date END,m.created_at DESC,m.id DESC LIMIT 1;
  END IF;
  WITH events AS (
    SELECT b.id booking_id,s.start_at,s.end_at,b.status::text status,b.distance_m,
      b.bow_usage_type::text bow_usage_type,b.bow_poundage,b.active_membership_id student_membership_id,
      m.membership_code,b.admin_notes note,'booking'::text event_source,
      c.cancellation_source::text cancellation_source,c.resolution::text cancellation_resolution
    FROM public.bookings b JOIN public.sessions s ON s.id=b.session_id
    LEFT JOIN public.student_memberships m ON m.id=b.active_membership_id
    LEFT JOIN LATERAL (SELECT x.cancellation_source,x.resolution FROM public.booking_cancellations x
      WHERE x.booking_id=b.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) c ON true
    WHERE b.student_id=v_student AND NOT EXISTS (SELECT 1 FROM public.attendance_reversals r WHERE r.booking_id=b.id)
    UNION ALL
    SELECT w.id,w.week_end::timestamp AT TIME ZONE 'America/Lima',w.week_end::timestamp AT TIME ZONE 'America/Lima',
      'no_show',NULL::integer,NULL::text,NULL::integer,w.student_membership_id,m.membership_code,
      COALESCE(w.note,'Inasistencia semanal histórica'),'weekly',NULL::text,NULL::text
    FROM public.student_weekly_attendance w LEFT JOIN public.student_memberships m ON m.id=w.student_membership_id
    WHERE w.student_id=v_student AND NOT EXISTS (SELECT 1 FROM public.attendance_reversals r WHERE r.weekly_attendance_id=w.id)
    UNION ALL
    SELECT md5(e.id::text||':'||slot.n::text)::uuid,e.expired_at-interval '1 second',e.expired_at,
      'expired_unattended',NULL::integer,NULL::text,NULL::integer,e.student_membership_id,m.membership_code,
      'No recuperable. Clase pendiente al finalizar el periodo de membresía.','expiry',NULL::text,NULL::text
    FROM public.membership_class_expirations e JOIN public.student_memberships m ON m.id=e.student_membership_id
    CROSS JOIN LATERAL generate_series(1,e.normal_classes+e.recovery_classes) slot(n)
    WHERE e.student_id=v_student
  ), classified AS (
    SELECT e.*, (e.event_source='booking' AND e.status='reserved' AND e.start_at>now()) is_upcoming FROM events e
  ), filtered AS (
    SELECT e.* FROM classified e WHERE e.is_upcoming=(p_scope='upcoming')
      AND (p_status='all' OR e.status=p_status)
      AND (p_month IS NULL OR ((e.start_at AT TIME ZONE 'America/Lima')::date>=date_trunc('month',p_month)::date
        AND (e.start_at AT TIME ZONE 'America/Lima')::date<(date_trunc('month',p_month)+interval '1 month')::date))
  ), paged AS (
    SELECT * FROM filtered ORDER BY
      CASE WHEN p_scope='upcoming' THEN start_at END ASC,
      CASE WHEN p_scope='history' THEN start_at END DESC,booking_id DESC
    LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT jsonb_build_object('rows',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'is_upcoming') FROM paged p),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,
    'summary',jsonb_build_object('upcoming',(SELECT count(*) FROM classified WHERE is_upcoming),
      'history',(SELECT count(*) FROM classified WHERE NOT is_upcoming),
      'attended',(SELECT count(*) FROM classified WHERE status='attended'),
      'currentCancelled',(SELECT count(*) FROM classified WHERE student_membership_id=v_membership AND status='cancelled'),
      'currentNoShow',(SELECT count(*) FROM classified WHERE student_membership_id=v_membership AND status='no_show'),
      'currentMembershipId',v_membership)) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.student_get_booking_history(uuid,text,date,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.student_get_booking_history(uuid,text,date,text,integer,integer) TO authenticated,service_role;
