-- ============================================================================
-- Student operational status automation
-- Date: 2026-06-03
-- ============================================================================
-- Definitive rules:
-- - Membership state and student operational state are different concepts.
-- - A membership becomes expired when end_date passes OR classes_remaining <= 0.
-- - expired_at is recorded once and starts the 14 complete-day grace period.
-- - On day 15 without renewal, student operational_status becomes paused.
-- - A new membership sale replaces the active cycle; no classes, dates or credits
--   are accumulated automatically.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS operational_status text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS operational_status_reason text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS operational_status_updated_at timestamptz;

ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS expiration_reason text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.student_memberships sm
    WHERE sm.status = 'active'
    GROUP BY sm.student_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen alumnos con mas de una membresia activa. Ejecuta primero el diagnostico read-only y resuelve la reconciliacion historica.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_memberships_one_active
  ON public.student_memberships(student_id)
  WHERE status = 'active';

UPDATE public.students
SET
  operational_status = CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'paused' END,
  operational_status_reason = COALESCE(operational_status_reason, 'Estado inicial derivado desde is_active'),
  operational_status_updated_at = COALESCE(operational_status_updated_at, now())
WHERE operational_status IS NULL;

ALTER TABLE public.students
  ALTER COLUMN operational_status SET DEFAULT 'active',
  ALTER COLUMN operational_status SET NOT NULL,
  ALTER COLUMN operational_status_updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_operational_status_chk'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_operational_status_chk
      CHECK (
        operational_status IN (
          'active',
          'expired',
          'paused',
          'retired',
          'withdrawn',
          'blocked',
          'suspended'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_memberships_expiration_reason_chk'
      AND conrelid = 'public.student_memberships'::regclass
  ) THEN
    ALTER TABLE public.student_memberships
      ADD CONSTRAINT student_memberships_expiration_reason_chk
      CHECK (
        expiration_reason IS NULL
        OR expiration_reason IN ('end_date', 'no_classes_remaining', 'manual')
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_student_protected_operational_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_status, '') IN ('retired', 'withdrawn', 'blocked', 'suspended');
$$;

CREATE OR REPLACE FUNCTION public.membership_end_date_expired_at(p_end_date date)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_end_date IS NULL THEN NULL
    ELSE ((p_end_date + 1)::timestamp AT TIME ZONE 'America/Lima')
  END;
$$;

CREATE OR REPLACE FUNCTION public.trg_normalize_membership_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND COALESCE(NEW.classes_remaining, 0) <= 0 THEN
    NEW.status := 'expired';
    NEW.classes_remaining := 0;
    NEW.expired_at := COALESCE(
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.expired_at ELSE NULL END,
      NEW.expired_at,
      now()
    );
    NEW.expiration_reason := COALESCE(
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.expiration_reason ELSE NULL END,
      NEW.expiration_reason,
      'no_classes_remaining'
    );
  ELSIF NEW.status = 'expired'
    AND (
      TG_OP = 'INSERT'
      OR COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END, '') <> 'expired'
    )
  THEN
    NEW.expired_at := COALESCE(
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.expired_at ELSE NULL END,
      NEW.expired_at,
      CASE
        WHEN NEW.end_date IS NOT NULL
          AND NEW.end_date < (now() AT TIME ZONE 'America/Lima')::date
          THEN public.membership_end_date_expired_at(NEW.end_date)
        ELSE now()
      END
    );
    NEW.expiration_reason := COALESCE(
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.expiration_reason ELSE NULL END,
      NEW.expiration_reason,
      CASE
        WHEN NEW.end_date IS NOT NULL
          AND NEW.end_date < (now() AT TIME ZONE 'America/Lima')::date
          THEN 'end_date'
        ELSE 'manual'
      END
    );
    NEW.classes_remaining := GREATEST(COALESCE(NEW.classes_remaining, 0), 0);
  ELSE
    NEW.classes_remaining := GREATEST(COALESCE(NEW.classes_remaining, 0), 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_membership_expiration_before_write
  ON public.student_memberships;

CREATE TRIGGER trg_normalize_membership_expiration_before_write
  BEFORE INSERT OR UPDATE OF status, classes_remaining, end_date ON public.student_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_normalize_membership_expiration();

CREATE OR REPLACE FUNCTION public.sync_student_membership_operational_status(
  p_student_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_lima timestamp := now() AT TIME ZONE 'America/Lima';
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_row_count integer := 0;
  v_total_changed integer := 0;
BEGIN
  UPDATE public.student_memberships
  SET
    status = 'expired',
    expired_at = COALESCE(expired_at, public.membership_end_date_expired_at(end_date)),
    expiration_reason = COALESCE(expiration_reason, 'end_date'),
    classes_remaining = GREATEST(COALESCE(classes_remaining, 0), 0),
    updated_at = now()
  WHERE (p_student_id IS NULL OR student_id = p_student_id)
    AND status = 'active'
    AND end_date IS NOT NULL
    AND end_date < v_today;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  UPDATE public.student_memberships
  SET
    status = 'expired',
    expired_at = COALESCE(expired_at, now()),
    expiration_reason = COALESCE(expiration_reason, 'no_classes_remaining'),
    classes_remaining = 0,
    updated_at = now()
  WHERE (p_student_id IS NULL OR student_id = p_student_id)
    AND status = 'active'
    AND classes_remaining <= 0;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  WITH target_students AS (
    SELECT s.id, s.is_active, s.operational_status
    FROM public.students s
    WHERE p_student_id IS NULL OR s.id = p_student_id
  ),
  computed AS (
    SELECT
      ts.id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships active_sm
          WHERE active_sm.student_id = ts.id
            AND active_sm.status = 'active'
            AND COALESCE(active_sm.classes_remaining, 0) > 0
            AND active_sm.start_date <= v_today
            AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
        ) THEN 'active'
        WHEN latest_expired.id IS NOT NULL
          AND (
            v_now_lima >= (
              COALESCE(
                latest_expired.expired_at,
                public.membership_end_date_expired_at(latest_expired.end_date),
                latest_expired.updated_at,
                latest_expired.created_at
              ) AT TIME ZONE 'America/Lima'
            ) + interval '14 days'
          )
          THEN 'paused'
        WHEN latest_expired.id IS NOT NULL
          THEN 'expired'
        WHEN COALESCE(ts.is_active, false)
          THEN 'active'
        ELSE 'paused'
      END AS next_status,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships active_sm
          WHERE active_sm.student_id = ts.id
            AND active_sm.status = 'active'
            AND COALESCE(active_sm.classes_remaining, 0) > 0
            AND active_sm.start_date <= v_today
            AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
        ) THEN 'Membresia activa vigente con saldo disponible'
        WHEN latest_expired.id IS NOT NULL
          AND (
            v_now_lima >= (
              COALESCE(
                latest_expired.expired_at,
                public.membership_end_date_expired_at(latest_expired.end_date),
                latest_expired.updated_at,
                latest_expired.created_at
              ) AT TIME ZONE 'America/Lima'
            ) + interval '14 days'
          )
          THEN 'Mas de 14 dias completos sin membresia activa'
        WHEN latest_expired.id IS NOT NULL
          THEN 'Membresia expirada dentro del periodo de seguimiento'
        WHEN COALESCE(ts.is_active, false)
          THEN 'Alumno activo sin membresia registrada'
        ELSE 'Alumno sin membresia activa'
      END AS next_reason
    FROM target_students ts
    LEFT JOIN LATERAL (
      SELECT sm.*
      FROM public.student_memberships sm
      WHERE sm.student_id = ts.id
        AND sm.status = 'expired'
      ORDER BY
        COALESCE(
          sm.expired_at,
          public.membership_end_date_expired_at(sm.end_date),
          sm.updated_at,
          sm.created_at
        ) DESC,
        sm.created_at DESC,
        sm.id DESC
      LIMIT 1
    ) latest_expired ON true
  )
  UPDATE public.students s
  SET
    operational_status = computed.next_status,
    operational_status_reason = computed.next_reason,
    operational_status_updated_at = now(),
    is_active = computed.next_status = 'active',
    updated_at = now()
  FROM computed
  WHERE s.id = computed.id
    AND NOT public.is_student_protected_operational_status(s.operational_status)
    AND (
      s.operational_status IS DISTINCT FROM computed.next_status
      OR s.operational_status_reason IS DISTINCT FROM computed.next_reason
      OR s.is_active IS DISTINCT FROM (computed.next_status = 'active')
    );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  RETURN v_total_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_sync_student_operational_status_after_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_student_id := COALESCE(NEW.student_id, OLD.student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_operational_status_after_membership_change
  ON public.student_memberships;

CREATE TRIGGER trg_sync_student_operational_status_after_membership_change
  AFTER INSERT OR UPDATE OR DELETE ON public.student_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_student_operational_status_after_membership_change();

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'student-operational-status-sync-lima'
    ) THEN
      PERFORM cron.unschedule('student-operational-status-sync-lima');
    END IF;

    PERFORM cron.schedule(
      'student-operational-status-sync-lima',
      '0 8 * * *',
      $job$
        SELECT public.sync_student_membership_operational_status(NULL);
      $job$
    );
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.book_session(uuid);
DROP FUNCTION IF EXISTS public.book_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.book_session(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_session_day_cutoff timestamptz;
  v_pending_reserved_count integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  IF v_session.start_at <= now() THEN
    RAISE EXCEPTION 'No puedes reservar una clase pasada';
  END IF;

  v_session_day_cutoff := public.get_booking_day_cutoff(
    (v_session.start_at AT TIME ZONE 'America/Lima')::date
  );

  IF v_session_day_cutoff IS NOT NULL AND now() >= v_session_day_cutoff THEN
    RAISE EXCEPTION 'Las reservas para este dia se cerraron 2 horas antes del primer turno';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'America/Lima')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'America/Lima')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_pending_reserved_count
  FROM public.bookings b
  WHERE b.student_id = v_student_id
    AND b.active_membership_id = v_membership.id
    AND b.status = 'reserved';

  IF v_pending_reserved_count >= COALESCE(v_membership.classes_remaining, 0) THEN
    RAISE EXCEPTION 'El alumno ya tiene reservadas todas sus clases disponibles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session
      AND b.student_id = v_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  v_availability := public.check_session_availability_v3(p_session, v_student_id);

  IF (v_availability->>'available')::boolean = false THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    v_student_id,
    v_actor_id,
    v_membership.id,
    p_session,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_session(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_book_session(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_book_session(
  p_session_id uuid,
  p_student_id uuid,
  p_admin_notes text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_availability jsonb;
  v_bow_usage_type text;
  v_pending_reserved_count integer;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM public.sync_student_membership_operational_status(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RAISE EXCEPTION 'El alumno no esta activo para reservar';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.student_memberships sm
  WHERE sm.student_id = p_student_id
    AND sm.status = 'active'
    AND COALESCE(sm.classes_remaining, 0) > 0
    AND sm.start_date <= (v_session.start_at AT TIME ZONE 'America/Lima')::date
    AND (
      sm.end_date IS NULL
      OR sm.end_date >= (v_session.start_at AT TIME ZONE 'America/Lima')::date
    )
  ORDER BY sm.start_date DESC, sm.created_at DESC
  LIMIT 1;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una membresia activa con clases disponibles para la fecha de esta sesion';
  END IF;

  IF NOT p_force THEN
    SELECT COUNT(*)::integer
    INTO v_pending_reserved_count
    FROM public.bookings b
    WHERE b.student_id = p_student_id
      AND b.active_membership_id = v_membership.id
      AND b.status = 'reserved';

    IF v_pending_reserved_count >= COALESCE(v_membership.classes_remaining, 0) THEN
      RAISE EXCEPTION 'El alumno ya tiene reservadas todas sus clases disponibles';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.session_id = p_session_id
      AND b.student_id = p_student_id
      AND b.status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'El alumno ya reservo esta sesion';
  END IF;

  v_bow_usage_type := CASE
    WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
    WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF NOT p_force THEN
    v_availability := public.check_session_availability_v3(p_session_id, p_student_id);

    IF (v_availability->>'available')::boolean = false THEN
      RAISE EXCEPTION '%', v_availability->>'message';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    student_id,
    booked_by_profile_id,
    active_membership_id,
    session_id,
    status,
    distance_m,
    group_type,
    bow_usage_type,
    bow_poundage,
    admin_notes,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id),
    p_student_id,
    v_actor_id,
    v_membership.id,
    p_session_id,
    'reserved',
    v_student.current_distance_m,
    (
      CASE
        WHEN v_bow_usage_type = 'own' THEN 'ownbow'
        WHEN v_bow_usage_type = 'assigned' THEN 'assigned'
        ELSE NULL
      END
    )::public.group_type,
    v_bow_usage_type,
    v_student.bow_poundage,
    NULLIF(btrim(p_admin_notes), ''),
    now(),
    now()
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.get_available_sessions_for_student(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_available_sessions_for_student(
  p_student_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  already_reserved boolean,
  distance_m integer,
  bow_usage_type text,
  slot_capacity integer,
  distance_reserved integer,
  bow_capacity integer,
  bow_reserved integer,
  spots_for_student integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RETURN;
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_memberships sm
    WHERE sm.student_id = v_student_id
      AND sm.status = 'active'
      AND COALESCE(sm.classes_remaining, 0) > 0
      AND sm.start_date <= p_date_to
      AND (sm.end_date IS NULL OR sm.end_date >= p_date_from)
  ) THEN
    RETURN;
  END IF;

  v_bow_usage_type := CASE
    WHEN v_student.has_own_bow THEN 'own'
    WHEN v_student.assigned_bow THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  WITH distance_caps AS (
    SELECT
      s.id AS session_id,
      s.start_at,
      s.end_at,
      s.status,
      v_student.current_distance_m AS distance_m,
      COALESCE(sda.slot_capacity, sda.targets * 4, 0) AS slot_capacity
    FROM public.sessions s
    LEFT JOIN public.session_distance_allocations sda
      ON sda.session_id = s.id
     AND sda.distance_m = v_student.current_distance_m
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') BETWEEN p_date_from AND p_date_to
  ),
  student_reservations AS (
    SELECT
      b.session_id,
      true AS already_reserved
    FROM public.bookings b
    WHERE b.student_id = v_student_id
      AND b.status = 'reserved'
  ),
  distance_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.distance_m = v_student.current_distance_m
      AND b.status = 'reserved'
    GROUP BY b.session_id
  ),
  bow_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.status = 'reserved'
      AND b.bow_usage_type = 'shared_inventory'
      AND b.bow_poundage = v_student.bow_poundage
    GROUP BY b.session_id
  )
  SELECT
    dc.session_id,
    dc.start_at,
    dc.end_at,
    dc.status::text,
    COALESCE(sr.already_reserved, false) AS already_reserved,
    dc.distance_m,
    v_bow_usage_type,
    dc.slot_capacity,
    COALESCE(dr.reserved_count, 0) AS distance_reserved,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(bi.quantity_active, 0)
      ELSE NULL
    END AS bow_capacity,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(br.reserved_count, 0)
      ELSE NULL
    END AS bow_reserved,
    CASE
      WHEN dc.status <> 'scheduled' THEN 0
      WHEN dc.start_at <= now() THEN 0
      WHEN COALESCE(sr.already_reserved, false) THEN 0
      WHEN dc.slot_capacity <= 0 THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned')
        THEN GREATEST(dc.slot_capacity - COALESCE(dr.reserved_count, 0), 0)
      ELSE GREATEST(
        LEAST(
          dc.slot_capacity - COALESCE(dr.reserved_count, 0),
          COALESCE(bi.quantity_active, 0) - COALESCE(br.reserved_count, 0)
        ),
        0
      )
    END AS spots_for_student
  FROM distance_caps dc
  LEFT JOIN student_reservations sr
    ON sr.session_id = dc.session_id
  LEFT JOIN distance_reserved dr
    ON dr.session_id = dc.session_id
  LEFT JOIN bow_reserved br
    ON br.session_id = dc.session_id
  LEFT JOIN public.bow_inventory bi
    ON bi.draw_weight_lbs = v_student.bow_poundage
  ORDER BY dc.start_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  date_of_birth date,
  age integer,
  current_distance_m integer,
  category text,
  level text,
  student_is_active boolean,
  membership_name text,
  membership_start date,
  membership_end date,
  membership_status text,
  classes_total integer,
  classes_used integer,
  classes_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.avatar_url,
    s.date_of_birth,
    CASE
      WHEN s.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(current_date, s.date_of_birth))::integer
    END AS age,
    s.current_distance_m,
    s.category,
    s.level,
    (
      COALESCE(s.is_active, true)
      AND COALESCE(s.operational_status, 'active') = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.student_memberships active_sm
        WHERE active_sm.student_id = s.id
          AND active_sm.status = 'active'
          AND COALESCE(active_sm.classes_remaining, 0) > 0
          AND active_sm.start_date <= v_today
          AND (active_sm.end_date IS NULL OR active_sm.end_date >= v_today)
      )
    ) AS student_is_active,
    sm.custom_name AS membership_name,
    sm.start_date AS membership_start,
    sm.end_date AS membership_end,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_used,
    CASE
      WHEN sm.status <> 'active' THEN 0
      WHEN sm.end_date IS NOT NULL AND sm.end_date < v_today THEN 0
      ELSE COALESCE(sm.classes_remaining, 0)
    END AS classes_remaining
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.custom_name,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.status,
      sm_inner.classes_total,
      sm_inner.classes_used,
      sm_inner.classes_remaining
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = s.id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active'
          AND COALESCE(sm_inner.classes_remaining, 0) > 0
          AND sm_inner.start_date <= v_today
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today)
        THEN 0
        WHEN sm_inner.status = 'expired' THEN 1
        WHEN sm_inner.status = 'historical' THEN 2
        ELSE 3
      END,
      COALESCE(sm_inner.expired_at, public.membership_end_date_expired_at(sm_inner.end_date), sm_inner.created_at) DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  WHERE s.id = v_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_class_cards(
  p_student_id uuid DEFAULT NULL,
  p_student_membership_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_membership_id uuid,
  membership_name text,
  membership_status text,
  classes_total integer,
  classes_remaining integer,
  card_index integer,
  card_status text,
  booking_id uuid,
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  distance_m integer,
  bow_usage_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_membership_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL
    OR COALESCE(v_student.is_active, true) = false
    OR COALESCE(v_student.operational_status, 'active') <> 'active'
  THEN
    RETURN;
  END IF;

  IF p_student_membership_id IS NOT NULL THEN
    SELECT sm.id
    INTO v_membership_id
    FROM public.student_memberships sm
    WHERE sm.id = p_student_membership_id
      AND sm.student_id = v_student_id
      AND sm.status = 'active'
      AND COALESCE(sm.classes_remaining, 0) > 0
      AND sm.start_date <= v_today
      AND (sm.end_date IS NULL OR sm.end_date >= v_today);

    IF v_membership_id IS NULL THEN
      RAISE EXCEPTION 'Membresia no accesible para este alumno';
    END IF;
  ELSE
    SELECT sm.id
    INTO v_membership_id
    FROM public.student_memberships sm
    WHERE sm.student_id = v_student_id
      AND sm.status = 'active'
      AND COALESCE(sm.classes_remaining, 0) > 0
      AND sm.start_date <= v_today
      AND (sm.end_date IS NULL OR sm.end_date >= v_today)
    ORDER BY
      COALESCE(sm.start_date, DATE '0001-01-01') DESC,
      sm.created_at DESC,
      sm.id DESC
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH selected_membership AS (
    SELECT
      sm.id,
      sm.custom_name,
      sm.status,
      sm.classes_total,
      sm.classes_remaining
    FROM public.student_memberships sm
    WHERE sm.id = v_membership_id
  ),
  membership_bookings AS (
    SELECT
      row_number() OVER (
        ORDER BY
          COALESCE(s.start_at, b.created_at) ASC,
          b.created_at ASC,
          b.id ASC
      )::integer AS booking_position,
      b.id AS booking_id,
      b.session_id,
      s.start_at,
      s.end_at,
      b.distance_m,
      b.bow_usage_type,
      b.status::text AS card_status
    FROM public.bookings b
    LEFT JOIN public.sessions s
      ON s.id = b.session_id
    WHERE b.student_id = v_student_id
      AND b.active_membership_id = v_membership_id
      AND b.status IN ('reserved', 'attended', 'no_show')
  )
  SELECT
    sm.id AS student_membership_id,
    sm.custom_name AS membership_name,
    sm.status AS membership_status,
    sm.classes_total,
    sm.classes_remaining,
    slot.card_index,
    COALESCE(mb.card_status, 'available') AS card_status,
    mb.booking_id,
    mb.session_id,
    mb.start_at,
    mb.end_at,
    mb.distance_m,
    mb.bow_usage_type
  FROM selected_membership sm
  CROSS JOIN LATERAL generate_series(1, sm.classes_total) AS slot(card_index)
  LEFT JOIN membership_bookings mb
    ON mb.booking_position = slot.card_index
  ORDER BY slot.card_index ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_class_cards(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_children();
CREATE OR REPLACE FUNCTION public.get_my_children()
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  current_distance_m integer,
  level text,
  is_active boolean,
  relationship text,
  self_profile_id uuid,
  classes_remaining integer,
  membership_status text,
  next_booking_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  RETURN QUERY
  SELECT
    base.student_id,
    base.full_name,
    base.avatar_url,
    base.current_distance_m,
    base.level,
    (
      COALESCE(base.raw_is_active, true)
      AND COALESCE(base.operational_status, 'active') = 'active'
      AND sm.status = 'active'
      AND COALESCE(sm.classes_remaining, 0) > 0
      AND sm.start_date <= v_today_lima
      AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
    ) AS is_active,
    base.relationship,
    base.self_profile_id,
    CASE
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND sm.start_date <= v_today_lima
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
      THEN COALESCE(sm.classes_remaining, 0)
      ELSE 0
    END AS classes_remaining,
    CASE
      WHEN COALESCE(base.operational_status, 'active') <> 'active'
        THEN base.operational_status
      WHEN sm.status = 'active'
        AND COALESCE(sm.classes_remaining, 0) > 0
        AND sm.start_date <= v_today_lima
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
        THEN 'active'
      WHEN sm.status = 'active' THEN 'expired'
      ELSE sm.status::text
    END AS membership_status,
    nb.start_at AS next_booking_at
  FROM (
    SELECT
      s.id AS student_id,
      s.full_name,
      s.avatar_url,
      s.current_distance_m,
      s.level,
      s.is_active AS raw_is_active,
      s.operational_status,
      'self'::text AS relationship,
      s.self_profile_id
    FROM public.students s
    WHERE s.self_profile_id = auth.uid()

    UNION ALL

    SELECT
      s.id AS student_id,
      s.full_name,
      s.avatar_url,
      s.current_distance_m,
      s.level,
      s.is_active AS raw_is_active,
      s.operational_status,
      COALESCE(sg.relationship, 'guardian') AS relationship,
      s.self_profile_id
    FROM public.student_guardians sg
    INNER JOIN public.students s
      ON s.id = sg.student_id
    WHERE sg.guardian_profile_id = auth.uid()
      AND s.self_profile_id IS DISTINCT FROM auth.uid()
  ) base
  LEFT JOIN LATERAL (
    SELECT
      sm_inner.classes_remaining,
      sm_inner.status,
      sm_inner.start_date,
      sm_inner.end_date,
      sm_inner.expired_at,
      sm_inner.created_at
    FROM public.student_memberships sm_inner
    WHERE sm_inner.student_id = base.student_id
    ORDER BY
      CASE
        WHEN sm_inner.status = 'active'
          AND COALESCE(sm_inner.classes_remaining, 0) > 0
          AND sm_inner.start_date <= v_today_lima
          AND (sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today_lima)
        THEN 0
        WHEN sm_inner.status = 'expired' THEN 1
        WHEN sm_inner.status = 'historical' THEN 2
        ELSE 3
      END,
      COALESCE(sm_inner.expired_at, public.membership_end_date_expired_at(sm_inner.end_date), sm_inner.created_at) DESC,
      sm_inner.created_at DESC
    LIMIT 1
  ) sm ON true
  LEFT JOIN LATERAL (
    SELECT s_sess.start_at
    FROM public.bookings b_next
    INNER JOIN public.sessions s_sess ON s_sess.id = b_next.session_id
    WHERE b_next.student_id = base.student_id
      AND b_next.status = 'reserved'
      AND s_sess.start_at > now()
    ORDER BY s_sess.start_at ASC
    LIMIT 1
  ) nb ON true
  ORDER BY base.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_membership_plan(
  p_student_id uuid,
  p_membership_plan_id uuid,
  p_start_date date DEFAULT current_date,
  p_total_amount numeric DEFAULT NULL,
  p_payment_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_student public.students;
  v_plan public.membership_plans;
  v_membership_id uuid;
  v_start_date date;
  v_end_date date;
  v_total_amount numeric;
  v_payment_amount numeric;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.membership_plans
  WHERE id = p_membership_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan de membresia no encontrado';
  END IF;

  IF COALESCE(v_plan.is_active, true) = false THEN
    RAISE EXCEPTION 'El plan seleccionado esta inactivo';
  END IF;

  v_start_date := COALESCE(p_start_date, current_date);
  v_total_amount := COALESCE(p_total_amount, v_plan.base_price, 0);
  v_payment_amount := COALESCE(p_payment_amount, NULL);

  IF v_total_amount < 0 THEN
    RAISE EXCEPTION 'El monto total no puede ser negativo';
  END IF;

  IF v_payment_amount IS NOT NULL AND v_payment_amount < 0 THEN
    RAISE EXCEPTION 'El pago no puede ser negativo';
  END IF;

  IF v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN
    v_end_date := NULL;
  ELSE
    v_end_date := v_start_date + (v_plan.duration_days - 1);
  END IF;

  UPDATE public.student_memberships
  SET
    status = 'historical',
    updated_at = now()
  WHERE student_id = p_student_id
    AND status = 'active';

  INSERT INTO public.student_memberships (
    student_id,
    membership_plan_id,
    custom_name,
    classes_total,
    classes_used,
    classes_remaining,
    start_date,
    end_date,
    status,
    total_amount,
    currency,
    notes,
    sold_by_profile_id,
    created_at,
    updated_at
  )
  VALUES (
    p_student_id,
    v_plan.id,
    v_plan.name,
    v_plan.classes_included,
    0,
    v_plan.classes_included,
    v_start_date,
    v_end_date,
    'active',
    v_total_amount,
    COALESCE(v_plan.currency, 'PEN'),
    NULLIF(btrim(p_notes), ''),
    v_actor_id,
    now(),
    now()
  )
  RETURNING id INTO v_membership_id;

  INSERT INTO public.student_credit_ledger (
    student_id,
    student_membership_id,
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
    'membership_activation',
    v_plan.classes_included,
    v_plan.classes_included,
    format('Activacion de plan %s', v_plan.name),
    v_actor_id,
    now()
  );

  IF v_payment_amount IS NOT NULL THEN
    INSERT INTO public.student_membership_payments (
      student_id,
      student_membership_id,
      due_date,
      paid_at,
      amount,
      currency,
      payment_method,
      payment_status,
      reward_credits,
      reward_reason,
      notes,
      source,
      recorded_by_profile_id,
      created_at
    )
    VALUES (
      p_student_id,
      v_membership_id,
      v_start_date,
      now(),
      v_payment_amount,
      COALESCE(v_plan.currency, 'PEN'),
      'admin_manual',
      CASE
        WHEN v_payment_amount > 0 THEN 'paid'
        ELSE 'waived'
      END,
      0,
      NULL,
      'Pago inicial registrado al vender la membresia',
      'admin_assignment',
      v_actor_id,
      now()
    );
  END IF;

  UPDATE public.students
  SET
    operational_status = 'active',
    operational_status_reason = 'Nueva membresia activa asignada por administrador',
    operational_status_updated_at = now(),
    is_active = true,
    updated_at = now()
  WHERE id = p_student_id;

  RETURN v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.sync_student_membership_operational_status(uuid) IS
  'Sincroniza estado operativo de alumno y membresias con fecha de negocio America/Lima. La migracion registra pg_cron 03:00 Lima si esta disponible; si no, ejecutar con service_role desde Supabase Scheduled Job.';

COMMENT ON FUNCTION public.book_session(uuid, uuid) IS
  'Reserva una sesion solo si el alumno esta operational_status=active y tiene membresia activa vigente con saldo.';

COMMENT ON FUNCTION public.admin_book_session(uuid, uuid, text, boolean) IS
  'Reserva desde admin solo si el alumno esta operational_status=active y tiene membresia activa vigente con saldo; p_force no omite estado/membresia.';

COMMENT ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) IS
  'Lista turnos disponibles solo para alumnos activos con membresia activa vigente y saldo disponible.';

COMMENT ON FUNCTION public.get_student_class_cards(uuid, uuid) IS
  'Retorna cards visuales solo del ciclo activo actual si el alumno esta activo operativamente.';

COMMENT ON FUNCTION public.get_my_children() IS
  'Lista alumnos accesibles para self/guardian usando operational_status y membresia vigente con saldo para estado efectivo.';

COMMENT ON FUNCTION public.admin_assign_membership_plan(uuid, uuid, date, numeric, numeric, text) IS
  'Vende una nueva membresia V2 para un alumno, mueve la membresia activa previa a historico, crea un ciclo limpio y reactiva el estado operativo.';
