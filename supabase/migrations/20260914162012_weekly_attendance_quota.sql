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
