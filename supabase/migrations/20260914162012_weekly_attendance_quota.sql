DO $weekly_attendance_quota$
DECLARE
  v_plan_column_created boolean;
  v_membership_column_created boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'membership_plans'
      AND column_name = 'weekly_class_target'
  ) INTO v_plan_column_created;

  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_memberships'
      AND column_name = 'weekly_class_target'
  ) INTO v_membership_column_created;

  ALTER TABLE public.membership_plans
    ADD COLUMN IF NOT EXISTS weekly_class_target integer NOT NULL DEFAULT 0;

  ALTER TABLE public.membership_plans
    DROP CONSTRAINT IF EXISTS membership_plans_weekly_class_target_check;

  ALTER TABLE public.membership_plans
    ADD CONSTRAINT membership_plans_weekly_class_target_check
    CHECK (weekly_class_target BETWEEN 0 AND 4);

  ALTER TABLE public.student_memberships
    ADD COLUMN IF NOT EXISTS weekly_class_target integer NOT NULL DEFAULT 0;

  ALTER TABLE public.student_memberships
    DROP CONSTRAINT IF EXISTS student_memberships_weekly_class_target_check;

  ALTER TABLE public.student_memberships
    ADD CONSTRAINT student_memberships_weekly_class_target_check
    CHECK (weekly_class_target BETWEEN 0 AND 4);

  IF v_plan_column_created THEN
    WITH normalized_plans AS (
      SELECT
        id,
        lower(trim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) AS normalized_name
      FROM public.membership_plans
    )
    UPDATE public.membership_plans AS mp
    SET weekly_class_target = CASE
      WHEN np.normalized_name IN (
        'obsequio',
        'clase de introducción',
        'clase de introduccion',
        'paquete clases sueltas',
        'paquete 8 clases'
      ) THEN 0
      WHEN np.normalized_name ~ '^(membres[ií]a )?(media beca|afiliad(o|os|a|as))$'
        OR np.normalized_name ~ '^(membres[ií]a )?(1 clase|una clase) (por semana|semanal)$'
        THEN 1
      WHEN np.normalized_name ~ '^(membres[ií]a )?(2 clases|dos clases) (por semana|semanales)$'
        THEN 2
      WHEN np.normalized_name ~ '^(membres[ií]a )?(3 clases|tres clases) (por semana|semanales)$'
        THEN 3
      WHEN np.normalized_name ~ '^(membres[ií]a )?(4 clases|cuatro clases) (por semana|semanales)$'
        THEN 4
      ELSE 0
    END
    FROM normalized_plans AS np
    WHERE mp.id = np.id;
  END IF;

  IF v_membership_column_created THEN
    UPDATE public.student_memberships AS sm
    SET weekly_class_target = COALESCE(mp.weekly_class_target, 0)
    FROM public.membership_plans AS mp
    WHERE sm.membership_plan_id = mp.id;
  END IF;
END;
$weekly_attendance_quota$;

CREATE OR REPLACE FUNCTION public.set_student_membership_weekly_class_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.membership_plan_id IS NULL THEN
    NEW.weekly_class_target := OLD.weekly_class_target;
  ELSIF TG_OP = 'INSERT' AND NEW.membership_plan_id IS NULL THEN
    NEW.weekly_class_target := 0;
  ELSIF TG_OP = 'INSERT'
    OR NEW.membership_plan_id IS DISTINCT FROM OLD.membership_plan_id THEN
    SELECT mp.weekly_class_target
    INTO NEW.weekly_class_target
    FROM public.membership_plans AS mp
    WHERE mp.id = NEW.membership_plan_id;

    NEW.weekly_class_target := COALESCE(NEW.weekly_class_target, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_membership_weekly_class_target
  ON public.student_memberships;

CREATE TRIGGER set_student_membership_weekly_class_target
BEFORE INSERT OR UPDATE OF membership_plan_id ON public.student_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_student_membership_weekly_class_target();

ALTER TABLE public.student_weekly_attendance
  ADD COLUMN IF NOT EXISTS occurrence_index smallint,
  ADD COLUMN IF NOT EXISTS note text;

UPDATE public.student_weekly_attendance
SET occurrence_index = 1
WHERE occurrence_index IS NULL;

ALTER TABLE public.student_weekly_attendance
  ALTER COLUMN occurrence_index SET DEFAULT 1,
  ALTER COLUMN occurrence_index SET NOT NULL;

ALTER TABLE public.student_weekly_attendance
  DROP CONSTRAINT IF EXISTS student_weekly_attendance_occurrence_index_check;

ALTER TABLE public.student_weekly_attendance
  ADD CONSTRAINT student_weekly_attendance_occurrence_index_check
  CHECK (occurrence_index > 0);

ALTER TABLE public.student_weekly_attendance
  DROP CONSTRAINT IF EXISTS student_weekly_attendance_classes_consumed_check;

ALTER TABLE public.student_weekly_attendance
  ADD CONSTRAINT student_weekly_attendance_classes_consumed_check
  CHECK (classes_consumed = 1);

ALTER TABLE public.student_weekly_attendance
  DROP CONSTRAINT IF EXISTS student_weekly_attendance_student_week_unique;

ALTER TABLE public.student_weekly_attendance
  DROP CONSTRAINT IF EXISTS student_weekly_attendance_student_week_occurrence_unique;

ALTER TABLE public.student_weekly_attendance
  ADD CONSTRAINT student_weekly_attendance_student_week_occurrence_unique
  UNIQUE (student_id, week_start, occurrence_index);

DROP INDEX IF EXISTS public.idx_student_credit_ledger_weekly_attendance;

CREATE UNIQUE INDEX idx_student_credit_ledger_weekly_attendance
  ON public.student_credit_ledger(weekly_attendance_id)
  WHERE weekly_attendance_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_weekly_attendance_review(p_sunday date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_pending_count integer := 0;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden revisar inasistencias semanales';
  END IF;

  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RETURN jsonb_build_object(
      'is_sunday', false,
      'week_start', NULL,
      'week_end', p_sunday,
      'pending_count', 0,
      'candidates', '[]'::jsonb
    );
  END IF;

  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede revisar una semana futura';
  END IF;

  v_week_start := p_sunday - 3;

  SELECT COUNT(*)::integer
  INTO v_pending_count
  FROM public.bookings pending_booking
  INNER JOIN public.sessions pending_session
    ON pending_session.id = pending_booking.session_id
  WHERE pending_booking.status = 'reserved'
    AND pending_booking.student_id IS NOT NULL
    AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
      BETWEEN v_week_start AND p_sunday;

  IF v_pending_count = 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'student_id', candidate.student_id,
          'student_name', candidate.student_name,
          'avatar_url', candidate.avatar_url,
          'membership_id', candidate.membership_id,
          'membership_name', candidate.membership_name,
          'membership_end', candidate.membership_end,
          'classes_remaining', candidate.classes_remaining,
          'membership_available_classes', candidate.membership_available_classes,
          'available_classes', candidate.available_classes,
          'membership_display_status', candidate.membership_display_status,
          'weekly_class_target', candidate.weekly_class_target,
          'attended_count', candidate.attended_count,
          'booking_no_show_count', candidate.booking_no_show_count,
          'weekly_no_show_count', candidate.weekly_no_show_count,
          'completed_count', candidate.completed_count,
          'missing_count', candidate.missing_count
        )
        ORDER BY candidate.student_name, candidate.student_id
      ),
      '[]'::jsonb
    )
    INTO v_candidates
    FROM (
      SELECT
        base.*,
        LEAST(
          GREATEST(
            base.weekly_class_target
              - base.attended_count
              - base.booking_no_show_count
              - base.weekly_no_show_count,
            0
          ),
          base.available_classes
        )::integer AS missing_count
      FROM (
        SELECT
          st.id AS student_id,
          st.full_name AS student_name,
          st.avatar_url,
          consumption_membership.id AS membership_id,
          consumption_membership.custom_name AS membership_name,
          consumption_membership.end_date AS membership_end,
          consumption_membership.classes_remaining,
          (
            consumption_membership.classes_remaining
              - consumption_membership.reserved_count
          )::integer AS membership_available_classes,
          available_credit.available_classes,
          CASE
            WHEN consumption_membership.end_date IS NOT NULL
              AND consumption_membership.end_date <= p_sunday + 7
              THEN 'expiring'
            ELSE 'active'
          END AS membership_display_status,
          quota_membership.weekly_class_target,
          attendance_counts.attended_count,
          attendance_counts.booking_no_show_count,
          weekly_counts.weekly_no_show_count,
          (
            attendance_counts.attended_count
              + attendance_counts.booking_no_show_count
              + weekly_counts.weekly_no_show_count
          )::integer AS completed_count
        FROM public.students st
        INNER JOIN LATERAL (
          SELECT quota_membership.weekly_class_target
          FROM public.student_memberships AS quota_membership
          WHERE quota_membership.student_id = st.id
            AND quota_membership.status = 'active'
            AND quota_membership.weekly_class_target > 0
            AND quota_membership.start_date <= p_sunday
            AND (
              quota_membership.end_date IS NULL
              OR quota_membership.end_date >= p_sunday
            )
          ORDER BY
            quota_membership.start_date ASC,
            quota_membership.created_at ASC,
            quota_membership.id ASC
          LIMIT 1
        ) quota_membership ON true
        CROSS JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (
              WHERE attendance_booking.status = 'attended'
            )::integer AS attended_count,
            COUNT(*) FILTER (
              WHERE attendance_booking.status = 'no_show'
            )::integer AS booking_no_show_count
          FROM public.bookings attendance_booking
          INNER JOIN public.sessions attendance_session
            ON attendance_session.id = attendance_booking.session_id
          WHERE attendance_booking.student_id = st.id
            AND attendance_booking.status IN ('attended', 'no_show')
            AND (attendance_session.start_at AT TIME ZONE 'America/Lima')::date
              BETWEEN v_week_start AND p_sunday
        ) attendance_counts
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::integer AS weekly_no_show_count
          FROM public.student_weekly_attendance swa
          WHERE swa.student_id = st.id
            AND swa.week_start = v_week_start
            AND swa.status = 'no_show'
        ) weekly_counts
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            SUM(
              GREATEST(
                credit_membership.classes_remaining
                  - credit_membership_reserved.reserved_count,
                0
              )
            ),
            0
          )::integer AS available_classes
          FROM public.student_memberships AS credit_membership
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::integer AS reserved_count
            FROM public.bookings reserved_booking
            WHERE reserved_booking.active_membership_id = credit_membership.id
              AND reserved_booking.status = 'reserved'
          ) credit_membership_reserved
          WHERE credit_membership.student_id = st.id
            AND credit_membership.status = 'active'
            AND credit_membership.start_date <= p_sunday
            AND (
              credit_membership.end_date IS NULL
              OR credit_membership.end_date >= p_sunday
            )
        ) available_credit
        INNER JOIN LATERAL (
          SELECT
            consumption_membership.*,
            reserved.reserved_count
          FROM public.student_memberships AS consumption_membership
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::integer AS reserved_count
            FROM public.bookings reserved_booking
            WHERE reserved_booking.active_membership_id = consumption_membership.id
              AND reserved_booking.status = 'reserved'
          ) reserved
          WHERE consumption_membership.student_id = st.id
            AND consumption_membership.status = 'active'
            AND consumption_membership.start_date <= p_sunday
            AND (
              consumption_membership.end_date IS NULL
              OR consumption_membership.end_date >= p_sunday
            )
            AND consumption_membership.classes_remaining > reserved.reserved_count
          ORDER BY
            consumption_membership.start_date ASC,
            consumption_membership.created_at ASC,
            consumption_membership.id ASC
          LIMIT 1
        ) consumption_membership ON true
        WHERE st.is_active = true
          AND COALESCE(st.operational_status, '') NOT IN (
            'retired',
            'withdrawn',
            'blocked',
            'suspended'
          )
      ) base
    ) candidate
    WHERE candidate.missing_count > 0;
  END IF;

  RETURN jsonb_build_object(
    'is_sunday', true,
    'week_start', v_week_start,
    'week_end', p_sunday,
    'pending_count', v_pending_count,
    'candidates', v_candidates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_attendance_review(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_weekly_no_show(
  p_student_id uuid,
  p_sunday date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_student_id uuid;
  v_weekly_class_target integer := 0;
  v_attended_count integer := 0;
  v_booking_no_show_count integer := 0;
  v_weekly_no_show_count integer := 0;
  v_raw_missing_count integer := 0;
  v_available_classes integer := 0;
  v_remaining_missing_count integer := 0;
  v_membership_id uuid;
  v_membership_classes_remaining integer;
  v_reserved_count integer := 0;
  v_occurrence_index smallint;
  v_existing_id uuid;
  v_weekly_attendance_id uuid;
  v_note text;
  v_balance_after integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar inasistencias semanales';
  END IF;

  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RAISE EXCEPTION 'La revisión semanal solo puede registrarse para un domingo';
  END IF;

  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede registrar una inasistencia para una semana futura';
  END IF;

  v_week_start := p_sunday - 3;

  SELECT st.id
  INTO v_student_id
  FROM public.students st
  WHERE st.id = p_student_id
    AND st.is_active = true
    AND COALESCE(st.operational_status, '') NOT IN (
      'retired',
      'withdrawn',
      'blocked',
      'suspended'
    )
  FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado o no elegible';
  END IF;

  PERFORM sm.id
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND sm.start_date <= p_sunday
    AND (sm.end_date IS NULL OR sm.end_date >= p_sunday)
  ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.bookings pending_booking
    INNER JOIN public.sessions pending_session
      ON pending_session.id = pending_booking.session_id
    WHERE pending_booking.status = 'reserved'
      AND pending_booking.student_id IS NOT NULL
      AND (pending_session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_week_start AND p_sunday
  ) THEN
    RAISE EXCEPTION 'Primero completa las asistencias pendientes de jueves a domingo';
  END IF;

  SELECT quota_membership.weekly_class_target
  INTO v_weekly_class_target
  FROM public.student_memberships AS quota_membership
  WHERE quota_membership.student_id = p_student_id
    AND quota_membership.status = 'active'
    AND quota_membership.weekly_class_target > 0
    AND quota_membership.start_date <= p_sunday
    AND (
      quota_membership.end_date IS NULL
      OR quota_membership.end_date >= p_sunday
    )
  ORDER BY
    quota_membership.start_date ASC,
    quota_membership.created_at ASC,
    quota_membership.id ASC
  LIMIT 1;

  v_weekly_class_target := COALESCE(v_weekly_class_target, 0);

  SELECT
    COUNT(*) FILTER (
      WHERE attendance_booking.status = 'attended'
    )::integer,
    COUNT(*) FILTER (
      WHERE attendance_booking.status = 'no_show'
    )::integer
  INTO v_attended_count, v_booking_no_show_count
  FROM public.bookings attendance_booking
  INNER JOIN public.sessions attendance_session
    ON attendance_session.id = attendance_booking.session_id
  WHERE attendance_booking.student_id = p_student_id
    AND attendance_booking.status IN ('attended', 'no_show')
    AND (attendance_session.start_at AT TIME ZONE 'America/Lima')::date
      BETWEEN v_week_start AND p_sunday;

  SELECT COUNT(*)::integer
  INTO v_weekly_no_show_count
  FROM public.student_weekly_attendance swa
  WHERE swa.student_id = p_student_id
    AND swa.week_start = v_week_start
    AND swa.status = 'no_show';

  SELECT swa.id
  INTO v_existing_id
  FROM public.student_weekly_attendance swa
  WHERE swa.student_id = p_student_id
    AND swa.week_start = v_week_start
    AND swa.status = 'no_show'
  ORDER BY swa.occurrence_index DESC
  LIMIT 1;

  v_raw_missing_count := GREATEST(
    v_weekly_class_target
      - v_attended_count
      - v_booking_no_show_count
      - v_weekly_no_show_count,
    0
  );

  IF v_raw_missing_count <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id,
      'remaining_missing_count', 0,
      'classes_remaining', NULL
    );
  END IF;

  SELECT COALESCE(
    SUM(GREATEST(sm.classes_remaining - reserved.reserved_count, 0)),
    0
  )::integer
  INTO v_available_classes
  FROM public.student_memberships sm
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::integer AS reserved_count
    FROM public.bookings reserved_booking
    WHERE reserved_booking.active_membership_id = sm.id
      AND reserved_booking.status = 'reserved'
  ) reserved
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND sm.start_date <= p_sunday
    AND (sm.end_date IS NULL OR sm.end_date >= p_sunday);

  SELECT
    sm.id,
    sm.classes_remaining,
    reserved.reserved_count
  INTO
    v_membership_id,
    v_membership_classes_remaining,
    v_reserved_count
  FROM public.student_memberships sm
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::integer AS reserved_count
    FROM public.bookings reserved_booking
    WHERE reserved_booking.active_membership_id = sm.id
      AND reserved_booking.status = 'reserved'
  ) reserved
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND sm.start_date <= p_sunday
    AND (sm.end_date IS NULL OR sm.end_date >= p_sunday)
    AND sm.classes_remaining > reserved.reserved_count
  ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_marked', true,
      'weekly_attendance_id', v_existing_id,
      'remaining_missing_count', 0,
      'classes_remaining', NULL
    );
  END IF;

  SELECT (COALESCE(MAX(swa.occurrence_index), 0) + 1)::smallint
  INTO v_occurrence_index
  FROM public.student_weekly_attendance swa
  WHERE swa.student_id = p_student_id
    AND swa.week_start = v_week_start;

  v_note := CASE
    WHEN v_weekly_class_target = 1 THEN format(
      'El alumno asistió %s de la 1 clase requerida esta semana. Esta clase se considera inasistida.',
      v_attended_count
    )
    ELSE format(
      'El alumno asistió %s de las %s clases requeridas esta semana. Esta clase se considera inasistida.',
      v_attended_count,
      v_weekly_class_target
    )
  END;

  INSERT INTO public.student_weekly_attendance (
    student_id,
    student_membership_id,
    week_start,
    week_end,
    occurrence_index,
    status,
    classes_consumed,
    note,
    marked_by_profile_id,
    marked_at,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership_id,
    v_week_start,
    p_sunday,
    v_occurrence_index,
    'no_show',
    1,
    v_note,
    v_actor_id,
    now(),
    now()
  )
  RETURNING id INTO v_weekly_attendance_id;

  UPDATE ONLY public.student_memberships
  SET
    classes_used = classes_used + 1,
    classes_remaining = classes_remaining - 1,
    updated_at = now()
  WHERE id = v_membership_id
    AND classes_remaining > v_reserved_count
  RETURNING classes_remaining INTO v_balance_after;

  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'La membresía ya no tiene crédito libre disponible';
  END IF;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
    weekly_attendance_id,
    movement_type,
    delta,
    balance_after,
    reason,
    performed_by_profile_id,
    created_at
  )
  VALUES (
    p_student_id,
    v_membership_id,
    v_weekly_attendance_id,
    'weekly_no_show_consumed',
    -1,
    v_balance_after,
    v_note,
    v_actor_id,
    now()
  );

  v_remaining_missing_count := LEAST(
    GREATEST(v_raw_missing_count - 1, 0),
    GREATEST(v_available_classes - 1, 0)
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_marked', false,
    'weekly_attendance_id', v_weekly_attendance_id,
    'occurrence_index', v_occurrence_index,
    'remaining_missing_count', v_remaining_missing_count,
    'classes_remaining', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_weekly_attendance_review(date) IS
  'Calcula el déficit dominical por frecuencia contratada y crédito libre no comprometido.';

COMMENT ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) IS
  'Registra una inasistencia semanal por llamada y consume un crédito FIFO no comprometido.';
