BEGIN;

REVOKE ALL ON FUNCTION public.admin_assign_membership_from_profile(
  uuid,
  uuid,
  date,
  numeric,
  numeric,
  text,
  text,
  numeric,
  date,
  text
) FROM anon;

REVOKE ALL ON FUNCTION public.admin_manage_student_membership(uuid, text, jsonb) FROM anon;

COMMIT;
