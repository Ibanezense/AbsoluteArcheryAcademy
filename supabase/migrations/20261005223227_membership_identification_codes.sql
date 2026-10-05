-- A human-readable permanent identifier for each membership cycle.
ALTER TABLE public.student_memberships ADD COLUMN IF NOT EXISTS membership_code text;
CREATE SEQUENCE IF NOT EXISTS public.membership_code_sequence;
REVOKE ALL ON SEQUENCE public.membership_code_sequence FROM PUBLIC, anon, authenticated;

DO $$
DECLARE row_record record; next_number text;
BEGIN
  FOR row_record IN SELECT id, start_date FROM public.student_memberships
    WHERE membership_code IS NULL ORDER BY created_at, id
  LOOP
    next_number := nextval('public.membership_code_sequence')::text;
    UPDATE public.student_memberships SET membership_code =
      'MEM-' || EXTRACT(YEAR FROM row_record.start_date)::integer::text || '-' ||
      lpad(next_number, greatest(4, length(next_number)), '0') WHERE id = row_record.id;
  END LOOP;
END $$;

ALTER TABLE public.student_memberships ALTER COLUMN membership_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS student_memberships_code_unique
  ON public.student_memberships(membership_code);

CREATE OR REPLACE FUNCTION public.assign_membership_identification_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_number text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.membership_code IS DISTINCT FROM OLD.membership_code THEN
      RAISE EXCEPTION 'El código de membresía es permanente y no puede modificarse';
    END IF;
    RETURN NEW;
  END IF;
  next_number := nextval('public.membership_code_sequence')::text;
  NEW.membership_code := 'MEM-' || EXTRACT(YEAR FROM NEW.start_date)::integer::text || '-' ||
    lpad(next_number, greatest(4, length(next_number)), '0');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_membership_identification_code() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS membership_identification_code ON public.student_memberships;
CREATE TRIGGER membership_identification_code BEFORE INSERT OR UPDATE OF membership_code
  ON public.student_memberships FOR EACH ROW EXECUTE FUNCTION public.assign_membership_identification_code();

-- Repair only when a unique debit proves the original membership and student.
WITH proven AS (
  SELECT b.id, (array_agg(DISTINCT l.student_membership_id))[1] AS membership_id
  FROM public.bookings b
  JOIN public.student_credit_ledger l ON l.booking_id = b.id AND l.student_id = b.student_id AND l.delta < 0
  JOIN public.student_memberships m ON m.id = l.student_membership_id AND m.student_id = b.student_id
  WHERE b.active_membership_id IS NULL AND b.student_id IS NOT NULL
  GROUP BY b.id HAVING count(DISTINCT l.student_membership_id) = 1
)
UPDATE public.bookings b SET active_membership_id = proven.membership_id
FROM proven WHERE b.id = proven.id;

-- Attendance consumes the cycle committed by the reservation; never the new current cycle.
CREATE OR REPLACE FUNCTION public.validate_attendance_membership_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('attended', 'no_show') AND
     (NEW.active_membership_id IS DISTINCT FROM OLD.active_membership_id OR NEW.student_id IS DISTINCT FROM OLD.student_id) THEN
    RAISE EXCEPTION 'La membresía de una clase registrada no puede reasignarse';
  END IF;
  IF NEW.student_id IS NULL OR NEW.intro_client_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.active_membership_id IS NOT DISTINCT FROM OLD.active_membership_id
    AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id THEN RETURN NEW; END IF;
  IF NEW.status IN ('attended', 'no_show') AND NEW.active_membership_id IS NULL THEN
    RAISE EXCEPTION 'La clase no tiene membresía vinculada. Administración debe revisar su reserva';
  END IF;
  IF NEW.active_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_memberships m WHERE m.id = NEW.active_membership_id AND m.student_id = NEW.student_id
  ) THEN RAISE EXCEPTION 'La membresía no corresponde al alumno de esta clase'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_attendance_membership_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS attendance_membership_identity ON public.bookings;
CREATE TRIGGER attendance_membership_identity BEFORE INSERT OR UPDATE OF status, active_membership_id, student_id
  ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_membership_identity();

COMMENT ON COLUMN public.student_memberships.membership_code IS
  'Código único permanente del ciclo. Las clases se vinculan mediante el UUID existente, no por fecha ni por código visible.';

CREATE OR REPLACE FUNCTION public.validate_weekly_membership_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    (NEW.student_membership_id IS DISTINCT FROM OLD.student_membership_id OR NEW.student_id IS DISTINCT FROM OLD.student_id) THEN
    RAISE EXCEPTION 'La membresía de una inasistencia registrada no puede reasignarse';
  END IF;
  IF NEW.student_membership_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.student_memberships m WHERE m.id = NEW.student_membership_id AND m.student_id = NEW.student_id
  ) THEN RAISE EXCEPTION 'La inasistencia semanal debe vincularse a una membresía del alumno'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_weekly_membership_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS weekly_membership_identity ON public.student_weekly_attendance;
CREATE TRIGGER weekly_membership_identity BEFORE INSERT OR UPDATE OF student_membership_id, student_id
  ON public.student_weekly_attendance FOR EACH ROW EXECUTE FUNCTION public.validate_weekly_membership_identity();
