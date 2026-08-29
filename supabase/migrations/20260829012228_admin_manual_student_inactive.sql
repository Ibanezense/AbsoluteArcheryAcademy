BEGIN;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_operational_status_chk;

ALTER TABLE public.students
  ADD CONSTRAINT students_operational_status_chk
  CHECK (
    operational_status IN (
      'active',
      'expired',
      'paused',
      'inactive',
      'retired',
      'withdrawn',
      'blocked',
      'suspended'
    )
  );

CREATE OR REPLACE FUNCTION public.is_student_protected_operational_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_status, '') IN ('inactive', 'retired', 'withdrawn', 'blocked', 'suspended');
$$;

CREATE OR REPLACE FUNCTION public.admin_set_student_inactive(
  p_student_id uuid,
  p_inactive boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_student_id IS NULL OR p_inactive IS NULL THEN
    RAISE EXCEPTION 'El alumno y el estado son obligatorios';
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF p_inactive
    AND v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')
  THEN
    RAISE EXCEPTION 'El estado protegido actual del alumno no puede reemplazarse por inactivo';
  END IF;

  IF NOT p_inactive AND v_student.operational_status <> 'inactive' THEN
    RAISE EXCEPTION 'El alumno no tiene un estado inactivo manual';
  END IF;

  IF p_inactive THEN
    UPDATE public.students
    SET
      operational_status = 'inactive',
      is_active = false,
      operational_status_reason = 'Estado inactivo asignado manualmente por administrador',
      operational_status_updated_at = now(),
      updated_at = now()
    WHERE id = p_student_id;
  ELSE
    UPDATE public.students
    SET
      operational_status = 'active',
      is_active = false,
      operational_status_reason = 'Estado inactivo retirado manualmente por administrador',
      operational_status_updated_at = now(),
      updated_at = now()
    WHERE id = p_student_id;

    PERFORM public.sync_student_membership_operational_status(p_student_id);
  END IF;

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'student_id', v_student.id,
    'operational_status', v_student.operational_status,
    'manual_inactive', v_student.operational_status = 'inactive'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_set_student_inactive(uuid, boolean) IS
  'Permite a un administrador asignar o retirar el estado operativo inactivo sin deshabilitar la cuenta autenticada del alumno.';

REVOKE ALL ON FUNCTION public.admin_set_student_inactive(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_student_inactive(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_inactive(uuid, boolean) TO authenticated, service_role;

COMMIT;
