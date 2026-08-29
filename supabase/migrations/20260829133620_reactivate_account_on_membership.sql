BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS account_access_blocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.account_access_blocked IS
  'Bloqueo administrativo explicito de la cuenta individual, separado del estado academico del alumno.';

-- La interfaz anterior solo guardaba el bloqueo en profiles.is_active. Se
-- conserva de forma segura todo acceso individual ya deshabilitado; las
-- reparaciones confirmadas se desbloquean luego con precondiciones explicitas.
UPDATE public.students s
SET account_access_blocked = true
FROM public.profiles p
WHERE s.self_profile_id = p.id
  AND p.role = 'student'
  AND p.is_active = false;

-- Mantiene una membresia futura utilizable en pausa aunque exista historial
-- expirado. La membresia vigente sigue teniendo prioridad.
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
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships future_sm
          WHERE future_sm.student_id = ts.id
            AND future_sm.status = 'active'
            AND COALESCE(future_sm.classes_remaining, 0) > 0
            AND future_sm.start_date > v_today
        ) THEN 'paused'
        WHEN latest_expired.id IS NOT NULL
          AND v_now_lima >= (
            COALESCE(
              latest_expired.expired_at,
              public.membership_end_date_expired_at(latest_expired.end_date),
              latest_expired.updated_at,
              latest_expired.created_at
            ) AT TIME ZONE 'America/Lima'
          ) + interval '14 days'
          THEN 'paused'
        WHEN latest_expired.id IS NOT NULL THEN 'expired'
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships any_sm
          WHERE any_sm.student_id = ts.id
        ) THEN 'paused'
        WHEN COALESCE(ts.is_active, false) THEN 'active'
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
        WHEN EXISTS (
          SELECT 1
          FROM public.student_memberships future_sm
          WHERE future_sm.student_id = ts.id
            AND future_sm.status = 'active'
            AND COALESCE(future_sm.classes_remaining, 0) > 0
            AND future_sm.start_date > v_today
        ) THEN 'Membresia programada aun no vigente'
        WHEN latest_expired.id IS NOT NULL
          AND v_now_lima >= (
            COALESCE(
              latest_expired.expired_at,
              public.membership_end_date_expired_at(latest_expired.end_date),
              latest_expired.updated_at,
              latest_expired.created_at
            ) AT TIME ZONE 'America/Lima'
          ) + interval '14 days'
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
REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_student_account_access(
  p_student_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_profile_rows integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_student_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'El alumno y el estado de acceso son obligatorios';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF v_student.self_profile_id IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene una cuenta individual vinculada';
  END IF;

  IF p_is_active
    AND v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')
  THEN
    RAISE EXCEPTION 'El estado protegido actual no permite reactivar el acceso';
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active
  WHERE id = v_student.self_profile_id
    AND role = 'student';

  GET DIAGNOSTICS v_profile_rows = ROW_COUNT;
  IF v_profile_rows <> 1 THEN
    RAISE EXCEPTION 'La cuenta individual vinculada no es valida';
  END IF;

  UPDATE public.students
  SET
    account_access_blocked = NOT p_is_active,
    updated_at = now()
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'is_active', p_is_active,
    'operational_status', v_student.operational_status
  );
END;
$$;

COMMENT ON FUNCTION public.admin_set_student_account_access(uuid, boolean) IS
  'Bloquea o habilita atomicamente la cuenta individual sin reemplazar el estado academico del alumno.';

REVOKE ALL ON FUNCTION public.admin_set_student_account_access(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_student_account_access(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_account_access(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reactivate_student_account_after_membership_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF NEW.status <> 'active'
    OR COALESCE(NEW.classes_remaining, 0) <= 0
    OR (NEW.end_date IS NOT NULL AND NEW.end_date < v_today)
  THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = NEW.student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_student.account_access_blocked
    OR v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')
  THEN
    RETURN NEW;
  END IF;

  IF v_student.operational_status = 'inactive' THEN
    UPDATE public.students
    SET
      operational_status = 'active',
      is_active = false,
      operational_status_reason = 'Estado inactivo retirado al asignar una membresia',
      operational_status_updated_at = now(),
      updated_at = now()
    WHERE id = NEW.student_id;
  END IF;

  PERFORM public.sync_student_membership_operational_status(NEW.student_id);

  IF v_student.self_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_active = true
    WHERE id = v_student.self_profile_id
      AND role = 'student'
      AND is_active = false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_student_account_after_membership_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_student_account_after_membership_insert() FROM anon;
REVOKE ALL ON FUNCTION public.reactivate_student_account_after_membership_insert() FROM authenticated;

DROP TRIGGER IF EXISTS trg_reactivate_student_account_after_membership_insert
  ON public.student_memberships;

CREATE TRIGGER trg_reactivate_student_account_after_membership_insert
AFTER INSERT ON public.student_memberships
FOR EACH ROW
EXECUTE FUNCTION public.reactivate_student_account_after_membership_insert();

COMMENT ON FUNCTION public.reactivate_student_account_after_membership_insert() IS
  'Reactiva la cuenta individual al asignar una membresia utilizable, sin levantar estados protegidos de seguridad o baja.';

COMMIT;
