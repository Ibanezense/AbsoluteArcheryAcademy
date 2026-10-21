BEGIN;

-- Academic availability and account access have different lifecycles.
-- Never grant booking credits or renew a membership by enabling a profile.
CREATE OR REPLACE FUNCTION public.sync_student_account_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.self_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_active = (
      NOT NEW.account_access_blocked
      AND NEW.operational_status IN ('active','expired','paused')
    )
    WHERE id=NEW.self_profile_id AND role='student'
      AND is_active IS DISTINCT FROM (
        NOT NEW.account_access_blocked
        AND NEW.operational_status IN ('active','expired','paused')
      );
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_student_account_access() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_sync_student_account_access ON public.students;
CREATE TRIGGER trg_sync_student_account_access
AFTER INSERT OR UPDATE OF operational_status,account_access_blocked,self_profile_id
ON public.students FOR EACH ROW EXECUTE FUNCTION public.sync_student_account_access();

-- Reconcile existing accounts using the same rule. Explicit blocks remain intact.
UPDATE public.profiles p
SET is_active = (NOT s.account_access_blocked AND s.operational_status IN ('active','expired','paused'))
FROM public.students s
WHERE p.id=s.self_profile_id AND p.role='student'
  AND p.is_active IS DISTINCT FROM (NOT s.account_access_blocked AND s.operational_status IN ('active','expired','paused'));

COMMENT ON FUNCTION public.sync_student_account_access() IS
  'Permite entrar a alumnos activos, vencidos y en pausa; impide acceso a inactivos, bajas y bloqueos administrativos sin modificar membresias.';
COMMENT ON FUNCTION public.admin_set_student_inactive(uuid,boolean) IS
  'Asigna o retira el estado inactivo. El estado inactivo deshabilita el acceso; al retirarlo se recalcula el estado academico y se respetan bloqueos administrativos.';

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
    AND v_student.operational_status IN ('inactive', 'retired', 'withdrawn', 'blocked', 'suspended')
  THEN
    RAISE EXCEPTION 'El alumno esta inactivo, bloqueado o de baja. Cambia su estado antes de habilitar el acceso';
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


COMMIT;
