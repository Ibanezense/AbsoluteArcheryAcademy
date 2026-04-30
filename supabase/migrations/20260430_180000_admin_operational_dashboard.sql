-- ============================================================================
-- Admin operational dashboard
-- Fecha: 2026-04-30
-- Proposito:
-- 1. Centralizar el dashboard admin en una RPC operativa.
-- 2. Evitar traer listas completas al cliente para calcular KPIs.
-- 3. Agregar busqueda acotada de alumnos para el header compacto.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_search_students(text, integer);
CREATE OR REPLACE FUNCTION public.admin_search_students(
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  full_name text,
  dni text,
  phone text,
  email text,
  current_distance_m integer,
  membership_status text,
  classes_remaining integer,
  href text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_like text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_query IS NULL OR length(v_query) < 2 THEN
    RETURN;
  END IF;

  v_like := '%' || lower(v_query) || '%';

  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.dni::text,
    s.phone,
    s.email,
    s.current_distance_m,
    CASE
      WHEN current_membership.id IS NULL THEN 'no_membership'
      WHEN current_membership.end_date IS NOT NULL
        AND current_membership.end_date < ((now() AT TIME ZONE 'America/Lima')::date)
        THEN 'expired'
      WHEN COALESCE(current_membership.classes_remaining, 0) <= 0 THEN 'no_classes'
      ELSE 'active'
    END AS membership_status,
    COALESCE(current_membership.classes_remaining, 0)::integer AS classes_remaining,
    ('/admin/alumnos/' || s.id::text) AS href
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT sm.*
    FROM public.student_memberships sm
    WHERE sm.student_id = s.id
      AND sm.status = 'active'
    ORDER BY
      CASE
        WHEN sm.start_date <= ((now() AT TIME ZONE 'America/Lima')::date)
          AND (sm.end_date IS NULL OR sm.end_date >= ((now() AT TIME ZONE 'America/Lima')::date))
          THEN 0
        ELSE 1
      END,
      sm.start_date DESC,
      sm.created_at DESC
    LIMIT 1
  ) current_membership ON true
  WHERE COALESCE(s.is_active, true) = true
    AND (
      lower(s.full_name) LIKE v_like
      OR lower(COALESCE(s.phone, '')) LIKE v_like
      OR lower(COALESCE(s.email, '')) LIKE v_like
      OR lower(COALESCE(s.dni::text, '')) LIKE v_like
    )
  ORDER BY lower(s.full_name), s.full_name
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_students(text, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_admin_dashboard_operational_data();
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_operational_data()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date;
  v_week_end date := date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date + 6;
  v_month_start timestamp := date_trunc('month', now() AT TIME ZONE 'America/Lima');
  v_month_end timestamp := date_trunc('month', now() AT TIME ZONE 'America/Lima') + INTERVAL '1 month';
  v_reservations_today integer := 0;
  v_scheduled_sessions_today integer := 0;
  v_available_slots_today integer;
  v_pending_confirmations integer := 0;
  v_attendance_pending integer := 0;
  v_expiring_memberships integer := 0;
  v_students_without_classes integer := 0;
  v_pending_payments integer := 0;
  v_trial_without_follow_up integer := 0;
  v_recent_no_shows integer := 0;
  v_active_students integer := 0;
  v_new_students_this_month integer := 0;
  v_trial_classes_this_month integer := 0;
  v_revenue_this_month numeric := 0;
  v_weekly_occupancy_rate integer;
  v_weekly_agenda jsonb := '[]'::jsonb;
  v_weekly_occupancy jsonb := '[]'::jsonb;
  v_beginner integer := 0;
  v_developing integer := 0;
  v_advanced integer := 0;
  v_competitive integer := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_reservations_today
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = v_today_lima
    AND b.status IN ('reserved', 'attended', 'no_show');

  SELECT COUNT(*)::integer
  INTO v_scheduled_sessions_today
  FROM public.sessions s
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = v_today_lima
    AND s.status = 'scheduled';

  WITH today_capacity AS (
    SELECT
      COALESCE(SUM(ard.targets * 4), 0)::integer AS total_slots,
      COALESCE(SUM(ard.reserved_count), 0)::integer AS used_slots
    FROM public.admin_roster_by_distance ard
    INNER JOIN public.sessions s ON s.id = ard.session_id
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = v_today_lima
      AND s.status = 'scheduled'
  )
  SELECT
    CASE
      WHEN total_slots > 0 THEN GREATEST(total_slots - used_slots, 0)
      ELSE NULL
    END
  INTO v_available_slots_today
  FROM today_capacity;

  -- El esquema actual no tiene confirmacion separada para reservas regulares.
  -- Se tratan las clases de prueba reservadas para hoy como pendientes de confirmar.
  SELECT COUNT(*)::integer
  INTO v_pending_confirmations
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = v_today_lima
    AND b.intro_client_id IS NOT NULL
    AND b.status = 'reserved';

  SELECT COUNT(*)::integer
  INTO v_attendance_pending
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') = v_today_lima
    AND b.status = 'reserved';

  SELECT COUNT(*)::integer
  INTO v_expiring_memberships
  FROM public.student_memberships sm
  INNER JOIN public.students st ON st.id = sm.student_id
  WHERE COALESCE(st.is_active, true) = true
    AND sm.status = 'active'
    AND sm.end_date IS NOT NULL
    AND sm.end_date >= v_today_lima
    AND sm.end_date <= v_today_lima + 7;

  SELECT COUNT(*)::integer
  INTO v_students_without_classes
  FROM public.students st
  WHERE COALESCE(st.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_memberships sm
      WHERE sm.student_id = st.id
        AND sm.status = 'active'
        AND sm.start_date <= v_today_lima
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
        AND COALESCE(sm.classes_remaining, 0) > 0
    );

  SELECT COUNT(*)::integer
  INTO v_pending_payments
  FROM public.student_membership_payments p
  WHERE p.payment_status IN ('pending', 'late');

  -- No existe aun una columna de seguimiento/conversion de intro.
  -- Fallback operativo: intros pasadas de ultimos 30 dias que requieren revision manual.
  SELECT COUNT(*)::integer
  INTO v_trial_without_follow_up
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE b.intro_client_id IS NOT NULL
    AND b.status IN ('reserved', 'attended', 'no_show')
    AND DATE(s.start_at AT TIME ZONE 'America/Lima') < v_today_lima
    AND DATE(s.start_at AT TIME ZONE 'America/Lima') >= v_today_lima - 30;

  SELECT COUNT(*)::integer
  INTO v_recent_no_shows
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE b.status = 'no_show'
    AND DATE(s.start_at AT TIME ZONE 'America/Lima') >= v_today_lima - 14
    AND DATE(s.start_at AT TIME ZONE 'America/Lima') <= v_today_lima;

  SELECT COUNT(*)::integer
  INTO v_active_students
  FROM public.students st
  WHERE COALESCE(st.is_active, true) = true;

  SELECT COUNT(*)::integer
  INTO v_new_students_this_month
  FROM public.students st
  WHERE (st.created_at AT TIME ZONE 'America/Lima') >= v_month_start
    AND (st.created_at AT TIME ZONE 'America/Lima') < v_month_end;

  SELECT COUNT(*)::integer
  INTO v_trial_classes_this_month
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE b.intro_client_id IS NOT NULL
    AND b.status IN ('reserved', 'attended', 'no_show')
    AND (s.start_at AT TIME ZONE 'America/Lima') >= v_month_start
    AND (s.start_at AT TIME ZONE 'America/Lima') < v_month_end;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_revenue_this_month
  FROM public.student_membership_payments p
  WHERE p.payment_status = 'paid'
    AND (p.paid_at AT TIME ZONE 'America/Lima') >= v_month_start
    AND (p.paid_at AT TIME ZONE 'America/Lima') < v_month_end
    AND COALESCE(p.source, '') <> 'migration';

  WITH weekly_capacity AS (
    SELECT
      COALESCE(SUM(ard.targets * 4), 0)::integer AS total_slots,
      COALESCE(SUM(ard.reserved_count), 0)::integer AS used_slots
    FROM public.admin_roster_by_distance ard
    INNER JOIN public.sessions s ON s.id = ard.session_id
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') BETWEEN v_week_start AND v_week_end
      AND s.status = 'scheduled'
  )
  SELECT
    CASE
      WHEN total_slots > 0 THEN ROUND((used_slots::numeric / total_slots::numeric) * 100)::integer
      ELSE NULL
    END
  INTO v_weekly_occupancy_rate
  FROM weekly_capacity;

  WITH agenda_rows AS (
    SELECT
      b.id,
      b.session_id,
      b.student_id,
      b.intro_client_id,
      COALESCE(st.full_name, ic.full_name, 'Sin nombre') AS person_name,
      COALESCE(st.phone, ic.phone) AS phone,
      to_char((s.start_at AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS session_date,
      to_char(s.start_at AT TIME ZONE 'America/Lima', 'HH24:MI') AS start_time,
      GREATEST(
        ROUND(EXTRACT(EPOCH FROM (COALESCE(s.end_at, s.start_at + INTERVAL '90 minutes') - s.start_at)) / 60)::integer,
        0
      ) AS duration_minutes,
      CASE
        WHEN b.intro_client_id IS NOT NULL THEN 'trial'
        WHEN COALESCE(st.is_country_club_tiabaya_member, false) THEN 'cct'
        WHEN b.student_id IS NOT NULL THEN 'regular'
        ELSE 'other'
      END AS agenda_type,
      CASE
        WHEN b.status = 'reserved' AND b.intro_client_id IS NOT NULL THEN 'pending'
        WHEN b.status = 'reserved' THEN 'confirmed'
        WHEN b.status IN ('attended', 'no_show', 'cancelled') THEN b.status::text
        ELSE 'pending'
      END AS agenda_status,
      b.distance_m,
      CASE
        WHEN b.student_id IS NOT NULL THEN '/admin/alumnos/' || b.student_id::text
        ELSE '/admin/intro'
      END AS href,
      s.start_at
    FROM public.bookings b
    INNER JOIN public.sessions s ON s.id = b.session_id
    LEFT JOIN public.students st ON st.id = b.student_id
    LEFT JOIN public.intro_clients ic ON ic.id = b.intro_client_id
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') BETWEEN v_week_start AND v_week_end
      AND b.status IN ('reserved', 'attended', 'no_show', 'cancelled')
    ORDER BY s.start_at ASC, person_name ASC
    LIMIT 80
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ar.id::text,
        'bookingId', ar.id::text,
        'sessionId', ar.session_id::text,
        'studentId', ar.student_id::text,
        'introClientId', ar.intro_client_id::text,
        'personName', ar.person_name,
        'phone', ar.phone,
        'date', ar.session_date,
        'startTime', ar.start_time,
        'durationMinutes', ar.duration_minutes,
        'type', ar.agenda_type,
        'status', ar.agenda_status,
        'distanceM', ar.distance_m,
        'href', ar.href
      )
      ORDER BY ar.start_at ASC, ar.person_name ASC
    ),
    '[]'::jsonb
  )
  INTO v_weekly_agenda
  FROM agenda_rows ar;

  WITH week_days AS (
    SELECT
      generate_series(0, 6) AS day_offset,
      ARRAY['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] AS day_names
  ),
  daily_capacity AS (
    SELECT
      wd.day_offset,
      wd.day_names[wd.day_offset + 1] AS day_name,
      COALESCE(SUM(ard.targets * 4), 0)::integer AS total_slots,
      COALESCE(SUM(ard.reserved_count), 0)::integer AS used_slots
    FROM week_days wd
    LEFT JOIN public.sessions s
      ON DATE(s.start_at AT TIME ZONE 'America/Lima') = (v_week_start + (wd.day_offset || ' days')::interval)::date
      AND s.status = 'scheduled'
    LEFT JOIN public.admin_roster_by_distance ard ON ard.session_id = s.id
    GROUP BY wd.day_offset, wd.day_names
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'day', dc.day_name,
        'usedSlots', dc.used_slots,
        'totalSlots', CASE WHEN dc.total_slots > 0 THEN dc.total_slots ELSE NULL END,
        'occupancyRate', CASE
          WHEN dc.total_slots > 0 THEN ROUND((dc.used_slots::numeric / dc.total_slots::numeric) * 100)::integer
          ELSE NULL
        END
      )
      ORDER BY dc.day_offset
    ),
    '[]'::jsonb
  )
  INTO v_weekly_occupancy
  FROM daily_capacity dc;

  WITH active_students AS (
    SELECT
      CASE
        WHEN level_normalized LIKE '%competit%' THEN 'competitive'
        WHEN level_normalized LIKE '%avanzad%' THEN 'advanced'
        WHEN level_normalized LIKE '%desarroll%' THEN 'developing'
        WHEN level_normalized LIKE '%princip%' THEN 'beginner'
        ELSE NULL
      END AS level_bucket
    FROM (
      SELECT regexp_replace(trim(lower(COALESCE(st.level, ''))), '\s+', ' ', 'g') AS level_normalized
      FROM public.students st
      WHERE COALESCE(st.is_active, true) = true
    ) normalized
  )
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'beginner'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'developing'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'advanced'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'competitive'), 0)::integer
  INTO v_beginner, v_developing, v_advanced, v_competitive
  FROM active_students;

  RETURN json_build_object(
    'today', json_build_object(
      'reservationsToday', v_reservations_today,
      'scheduledSessionsToday', v_scheduled_sessions_today,
      'availableSlotsToday', v_available_slots_today,
      'pendingConfirmations', v_pending_confirmations,
      'attendancePending', v_attendance_pending
    ),
    'alerts', json_build_object(
      'expiringMemberships', v_expiring_memberships,
      'studentsWithoutClasses', v_students_without_classes,
      'pendingPayments', v_pending_payments,
      'trialClassesWithoutFollowUp', v_trial_without_follow_up,
      'recentNoShows', v_recent_no_shows
    ),
    'monthly', json_build_object(
      'activeStudents', v_active_students,
      'newStudentsThisMonth', v_new_students_this_month,
      'trialClassesThisMonth', v_trial_classes_this_month,
      'trialConversionRate', NULL,
      'revenueThisMonth', v_revenue_this_month,
      'weeklyOccupancyRate', v_weekly_occupancy_rate
    ),
    'weeklyAgenda', v_weekly_agenda,
    'weeklyOccupancy', v_weekly_occupancy,
    'studentsByLevel', json_build_object(
      'beginner', v_beginner,
      'developing', v_developing,
      'advanced', v_advanced,
      'competitive', v_competitive
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_operational_data() TO authenticated;

COMMENT ON FUNCTION public.admin_search_students(text, integer) IS
  'Busqueda acotada de alumnos activos para el header operativo admin.';

COMMENT ON FUNCTION public.get_admin_dashboard_operational_data() IS
  'Retorna datos operativos normalizados para el dashboard admin sin calcular KPIs pesados en el cliente.';
