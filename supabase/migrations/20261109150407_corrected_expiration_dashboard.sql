CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(student_id uuid, full_name text, avatar_url text, date_of_birth date, age integer, current_distance_m integer, category text, level text, student_is_active boolean, membership_name text, membership_start date, membership_end date, membership_status text, classes_total integer, classes_used integer, classes_remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);
  RETURN QUERY
  SELECT student.id, student.full_name, student.avatar_url, student.date_of_birth,
    CASE WHEN student.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(v_today, student.date_of_birth))::integer END,
    student.current_distance_m, student.category, student.level,
    (COALESCE(student.is_active, true)
      AND COALESCE(student.operational_status, 'active') = 'active'
      AND COALESCE(current_membership.available_classes, 0) > 0),
    COALESCE(current_membership.custom_name, fallback.custom_name),
    COALESCE(current_membership.start_date, fallback.start_date),
    COALESCE(current_membership.end_date, fallback.end_date),
    CASE
      WHEN current_membership.id IS NOT NULL AND current_membership.available_classes > 0 THEN 'active'
      WHEN current_membership.id IS NOT NULL THEN 'no_classes'
      WHEN fallback.status = 'active' AND fallback.start_date > v_today THEN 'scheduled'
      WHEN fallback.id IS NOT NULL THEN fallback.display_status
      ELSE 'no_membership'
    END,
    COALESCE(current_membership.classes_total, fallback.classes_total),
    COALESCE(current_membership.classes_used, fallback.classes_used),
    COALESCE(current_membership.available_classes, 0)::integer
  FROM public.students student
  LEFT JOIN LATERAL (
    SELECT membership.id, membership.custom_name, membership.start_date, membership.end_date,
      membership.classes_total + recovery.granted AS classes_total,
      membership.classes_used + recovery.used AS classes_used,
      GREATEST(COALESCE(membership.classes_remaining, 0) - commitments.normal_reserved, 0)
        + GREATEST(recovery.remaining - commitments.recovery_reserved, 0) AS available_classes
    FROM public.student_memberships membership
    CROSS JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE booking.credit_kind = 'normal')::integer AS normal_reserved,
        COUNT(*) FILTER (WHERE booking.credit_kind = 'recovery')::integer AS recovery_reserved
      FROM public.bookings booking
      WHERE booking.active_membership_id = membership.id AND booking.status = 'reserved'
    ) commitments
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(credit.classes_granted), 0)::integer AS granted,
        COALESCE(SUM(credit.classes_remaining), 0)::integer AS remaining,
        COALESCE(SUM(credit.classes_granted - credit.classes_remaining), 0)::integer AS used
      FROM public.membership_recovery_credits credit
      WHERE credit.student_membership_id = membership.id
    ) recovery
    WHERE membership.student_id = student.id AND membership.status = 'active'
      AND membership.start_date <= v_today
      AND (membership.end_date IS NULL OR membership.end_date >= v_today)
    ORDER BY membership.start_date, membership.created_at, membership.id
    LIMIT 1
  ) current_membership ON true
  LEFT JOIN LATERAL (
    SELECT membership.id, membership.status, membership.custom_name, membership.start_date,
      membership.end_date, membership.classes_total, (membership.classes_used + (SELECT count(*)::integer FROM public.attendance_expiration_corrections correction WHERE correction.student_membership_id=membership.id AND correction.credit_kind='normal')) AS classes_used,
      CASE WHEN membership.status = 'active' AND membership.start_date > v_today
        THEN 'scheduled' ELSE 'expired' END::text AS display_status
    FROM public.student_memberships membership
    WHERE membership.student_id = student.id
      AND ((membership.status = 'active' AND membership.start_date > v_today)
        OR membership.status IN ('expired', 'historical'))
    ORDER BY CASE WHEN membership.status = 'active' AND membership.start_date > v_today THEN 0 ELSE 1 END,
      CASE WHEN membership.status = 'active' AND membership.start_date > v_today THEN membership.start_date END,
      membership.created_at DESC, membership.id DESC
    LIMIT 1
  ) fallback ON current_membership.id IS NULL
  WHERE student.id = v_student_id;
END;
$function$;

