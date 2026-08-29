BEGIN;

CREATE OR REPLACE FUNCTION public.reactivate_student_account_after_membership_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
BEGIN
  IF NEW.status <> 'active'
    OR COALESCE(NEW.classes_remaining, 0) <= 0
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

  IF v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended') THEN
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
