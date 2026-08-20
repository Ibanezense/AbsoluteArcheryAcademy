CREATE OR REPLACE FUNCTION public.get_membership_renewal_alert_states(
  p_student_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  alert_state text,
  remaining_unconsumed_classes integer,
  has_current_membership boolean,
  has_scheduled_membership boolean,
  state_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := COALESCE(
    (auth.jwt() ->> 'role') = 'service_role',
    false
  );
  v_is_admin boolean;
  v_student_id uuid;
  v_student_ids uuid[];
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF NOT v_is_service_role AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_is_admin := NOT v_is_service_role AND public.is_admin_user();

  IF p_student_ids IS NULL THEN
    SELECT COALESCE(array_agg(accessible_student.id ORDER BY accessible_student.id), ARRAY[]::uuid[])
    INTO v_student_ids
    FROM public.students accessible_student
    WHERE v_is_service_role
      OR v_is_admin
      OR public.can_access_student(accessible_student.id);
  ELSE
    SELECT COALESCE(array_agg(requested.student_id ORDER BY requested.student_id), ARRAY[]::uuid[])
    INTO v_student_ids
    FROM (
      SELECT DISTINCT requested_id AS student_id
      FROM unnest(p_student_ids) AS requested_id
      WHERE requested_id IS NOT NULL
    ) requested;

    FOREACH v_student_id IN ARRAY v_student_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.students requested_student
        WHERE requested_student.id = v_student_id
      ) OR (
        NOT v_is_service_role
        AND NOT v_is_admin
        AND NOT public.can_access_student(v_student_id)
      ) THEN
        RAISE EXCEPTION 'No autorizado para consultar este alumno';
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  WITH requested_students AS (
    SELECT requested_student_id AS student_id
    FROM unnest(v_student_ids) AS requested_student_id
  ),
  membership_summaries AS (
    SELECT
      requested.student_id,
      EXISTS (
        SELECT 1
        FROM public.student_memberships history_membership
        WHERE history_membership.student_id = requested.student_id
          AND history_membership.status IN ('active', 'expired', 'consumed', 'historical')
      ) AS has_membership_history,
      COALESCE(eligible.remaining_unconsumed_classes, 0)::integer AS remaining_unconsumed_classes,
      COALESCE(eligible.has_current_membership, false) AS has_current_membership,
      COALESCE(eligible.has_scheduled_membership, false) AS has_scheduled_membership,
      COALESCE(
        eligible.membership_fingerprint,
        latest_history.membership_fingerprint,
        'no-membership'
      ) AS membership_fingerprint
    FROM requested_students requested
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(sm.classes_remaining, 0))::integer AS remaining_unconsumed_classes,
        BOOL_OR(sm.start_date <= v_today) AS has_current_membership,
        BOOL_OR(sm.start_date > v_today) AS has_scheduled_membership,
        STRING_AGG(
          concat_ws(
            '|',
            sm.id::text,
            sm.start_date::text,
            COALESCE(sm.end_date::text, 'open'),
            COALESCE(sm.classes_remaining, 0)::text
          ),
          ',' ORDER BY sm.start_date, sm.created_at, sm.id
        ) AS membership_fingerprint
      FROM public.student_memberships sm
      WHERE sm.student_id = requested.student_id
        AND sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND (sm.end_date IS NULL OR sm.end_date >= GREATEST(v_today, sm.start_date))
    ) eligible ON true
    LEFT JOIN LATERAL (
      SELECT concat_ws(
        '|',
        history_membership.id::text,
        history_membership.start_date::text,
        COALESCE(history_membership.end_date::text, 'open'),
        history_membership.status,
        COALESCE(history_membership.classes_remaining, 0)::text
      ) AS membership_fingerprint
      FROM public.student_memberships history_membership
      WHERE history_membership.student_id = requested.student_id
        AND history_membership.status IN ('active', 'expired', 'consumed', 'historical')
      ORDER BY
        history_membership.start_date DESC,
        history_membership.created_at DESC,
        history_membership.id DESC
      LIMIT 1
    ) latest_history ON true
  ),
  classified AS (
    SELECT
      summary.*,
      CASE
        WHEN summary.remaining_unconsumed_classes > 1 THEN 'none'
        WHEN summary.has_current_membership AND summary.remaining_unconsumed_classes = 1 THEN 'last_class'
        WHEN summary.has_scheduled_membership THEN 'none'
        WHEN summary.has_membership_history THEN 'expired'
        ELSE 'none'
      END AS alert_state
    FROM membership_summaries summary
  )
  SELECT
    classified.student_id,
    classified.alert_state,
    classified.remaining_unconsumed_classes,
    classified.has_current_membership,
    classified.has_scheduled_membership,
    classified.alert_state || ':' || MD5(classified.membership_fingerprint) AS state_key
  FROM classified
  ORDER BY classified.student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_membership_renewal_alert_states(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_membership_renewal_alert_states(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_membership_renewal_alert_states(uuid[]) TO authenticated, service_role;
