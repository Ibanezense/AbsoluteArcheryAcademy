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

-- The zero-frequency plans are listed explicitly to document the approved
-- classification: Obsequio, Clase de Introducción, Paquete clases sueltas
-- and Paquete 8 clases. Any other unrecognized plan also remains at zero.
UPDATE public.membership_plans
SET weekly_class_target = CASE
  WHEN lower(name) LIKE '%obsequio%'
    OR lower(name) LIKE '%clase de introducci%n%'
    OR lower(name) LIKE '%paquete clases sueltas%'
    OR lower(name) LIKE '%paquete 8 clases%'
    THEN 0
  WHEN lower(name) LIKE '%media beca%'
    OR lower(name) LIKE '%afiliad%'
    OR lower(name) LIKE '%1 clase por semana%'
    OR lower(name) LIKE '%1 clase semanal%'
    OR lower(name) LIKE '%una clase por semana%'
    OR lower(name) LIKE '%una clase semanal%'
    THEN 1
  WHEN lower(name) LIKE '%2 clases por semana%'
    OR lower(name) LIKE '%2 clases semanales%'
    OR lower(name) LIKE '%dos clases por semana%'
    OR lower(name) LIKE '%dos clases semanales%'
    THEN 2
  WHEN lower(name) LIKE '%3 clases por semana%'
    OR lower(name) LIKE '%3 clases semanales%'
    OR lower(name) LIKE '%tres clases por semana%'
    OR lower(name) LIKE '%tres clases semanales%'
    THEN 3
  WHEN lower(name) LIKE '%4 clases por semana%'
    OR lower(name) LIKE '%4 clases semanales%'
    OR lower(name) LIKE '%cuatro clases por semana%'
    OR lower(name) LIKE '%cuatro clases semanales%'
    THEN 4
  ELSE 0
END;

UPDATE public.student_memberships AS sm
SET weekly_class_target = COALESCE(mp.weekly_class_target, 0)
FROM public.membership_plans AS mp
WHERE sm.membership_plan_id = mp.id;

CREATE OR REPLACE FUNCTION public.set_student_membership_weekly_class_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.membership_plan_id IS DISTINCT FROM OLD.membership_plan_id
  THEN
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
