-- ============================================================================
-- V2 CORE ENTITIES
-- Fecha: 2026-02-27
-- Proposito:
-- 1. Separar cuenta de alumno
-- 2. Agregar soporte para tutores
-- 3. Crear membresias, pagos y ledger V2
-- 4. Mantener convivencia con el esquema actual
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PROFILES: compatibilidad para cuentas V2
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS dni char(8),
  ADD COLUMN IF NOT EXISTS access_code char(8),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET access_code = dni
WHERE access_code IS NULL
  AND dni IS NOT NULL
  AND dni ~ '^[0-9]{8}$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p2
    WHERE p2.id <> public.profiles.id
      AND p2.dni = public.profiles.dni
  );

DROP INDEX IF EXISTS idx_profiles_access_code_unique;
CREATE UNIQUE INDEX idx_profiles_access_code_unique
  ON public.profiles(access_code)
  WHERE access_code IS NOT NULL;

DROP INDEX IF EXISTS idx_profiles_dni_unique;
CREATE UNIQUE INDEX idx_profiles_dni_unique
  ON public.profiles(dni)
  WHERE dni IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'guardian', 'admin', 'coach'));

COMMENT ON COLUMN public.profiles.role IS
  'V2 roles: admin, guardian, student. coach queda deprecado temporalmente por compatibilidad.';

COMMENT ON COLUMN public.profiles.access_code IS
  'Codigo de acceso entregado por admin. En la version actual se alinea con DNI de 8 digitos.';

-- ----------------------------------------------------------------------------
-- HELPERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_active, true)
  );
$$;

-- ----------------------------------------------------------------------------
-- STUDENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  avatar_url text,
  date_of_birth date,
  dni char(8),
  phone text,
  email text,
  medical_notes text,
  current_distance_m integer,
  category text,
  level text,
  has_own_bow boolean NOT NULL DEFAULT false,
  assigned_bow boolean NOT NULL DEFAULT false,
  bow_poundage integer,
  is_active boolean NOT NULL DEFAULT true,
  self_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_dni_format_chk CHECK (dni IS NULL OR dni ~ '^[0-9]{8}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_dni_unique
  ON public.students(dni)
  WHERE dni IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_self_profile_unique
  ON public.students(self_profile_id)
  WHERE self_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_full_name
  ON public.students(full_name);

CREATE INDEX IF NOT EXISTS idx_students_is_active
  ON public.students(is_active);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT GUARDIANS
-- Regla actual: maximo un tutor por alumno
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship text,
  can_view_profile boolean NOT NULL DEFAULT true,
  can_view_memberships boolean NOT NULL DEFAULT true,
  can_book boolean NOT NULL DEFAULT true,
  can_cancel_booking boolean NOT NULL DEFAULT true,
  can_view_payments boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_guardians_student_unique UNIQUE (student_id),
  CONSTRAINT student_guardians_guardian_student_unique UNIQUE (guardian_profile_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian
  ON public.student_guardians(guardian_profile_id);

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- MEMBERSHIP PLANS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  classes_included integer NOT NULL CHECK (classes_included >= 0),
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  base_price numeric(10,2) CHECK (base_price IS NULL OR base_price >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_active
  ON public.membership_plans(is_active);

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT MEMBERSHIPS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  membership_plan_id uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  legacy_profile_membership_id uuid,
  custom_name text NOT NULL,
  classes_total integer NOT NULL CHECK (classes_total >= 0),
  classes_used integer NOT NULL DEFAULT 0 CHECK (classes_used >= 0),
  classes_remaining integer NOT NULL DEFAULT 0 CHECK (classes_remaining >= 0),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'expired', 'cancelled', 'consumed', 'historical')),
  total_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  notes text,
  sold_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_memberships_legacy_unique UNIQUE (legacy_profile_membership_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_memberships_one_active
  ON public.student_memberships(student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_student_memberships_student
  ON public.student_memberships(student_id, start_date DESC);

ALTER TABLE public.student_memberships ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT MEMBERSHIP PAYMENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_membership_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id) ON DELETE CASCADE,
  due_date date,
  paid_at timestamptz NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'PEN',
  payment_method text,
  payment_status text NOT NULL CHECK (payment_status IN ('pending', 'paid', 'late', 'cancelled', 'waived')),
  reward_credits integer NOT NULL DEFAULT 0 CHECK (reward_credits >= 0),
  reward_reason text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  recorded_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_membership_payments_student
  ON public.student_membership_payments(student_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_membership_payments_membership
  ON public.student_membership_payments(student_membership_id, paid_at DESC);

ALTER TABLE public.student_membership_payments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STUDENT CREDIT LEDGER
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid REFERENCES public.student_memberships(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'membership_activation',
      'booking_reserved',
      'booking_cancelled_refund',
      'admin_adjustment',
      'reward_credit',
      'migration_seed',
      'migration_usage'
    )
  ),
  delta integer NOT NULL,
  balance_after integer,
  reason text NOT NULL,
  performed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_credit_ledger_student
  ON public.student_credit_ledger(student_id, created_at DESC);

ALTER TABLE public.student_credit_ledger ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- ACCESS FUNCTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND (
        public.is_admin_user()
        OR s.self_profile_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.student_guardians sg
          WHERE sg.student_id = s.id
            AND sg.guardian_profile_id = auth.uid()
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS students_select_v2 ON public.students;
CREATE POLICY students_select_v2
  ON public.students
  FOR SELECT
  USING (public.can_access_student(id));

DROP POLICY IF EXISTS students_admin_write_v2 ON public.students;
CREATE POLICY students_admin_write_v2
  ON public.students
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_guardians_select_v2 ON public.student_guardians;
CREATE POLICY student_guardians_select_v2
  ON public.student_guardians
  FOR SELECT
  USING (
    public.is_admin_user()
    OR guardian_profile_id = auth.uid()
    OR public.can_access_student(student_id)
  );

DROP POLICY IF EXISTS student_guardians_admin_write_v2 ON public.student_guardians;
CREATE POLICY student_guardians_admin_write_v2
  ON public.student_guardians
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS membership_plans_read_v2 ON public.membership_plans;
CREATE POLICY membership_plans_read_v2
  ON public.membership_plans
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS membership_plans_admin_write_v2 ON public.membership_plans;
CREATE POLICY membership_plans_admin_write_v2
  ON public.membership_plans
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_memberships_select_v2 ON public.student_memberships;
CREATE POLICY student_memberships_select_v2
  ON public.student_memberships
  FOR SELECT
  USING (public.can_access_student(student_id));

DROP POLICY IF EXISTS student_memberships_admin_write_v2 ON public.student_memberships;
CREATE POLICY student_memberships_admin_write_v2
  ON public.student_memberships
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_membership_payments_select_v2 ON public.student_membership_payments;
CREATE POLICY student_membership_payments_select_v2
  ON public.student_membership_payments
  FOR SELECT
  USING (public.can_access_student(student_id));

DROP POLICY IF EXISTS student_membership_payments_admin_write_v2 ON public.student_membership_payments;
CREATE POLICY student_membership_payments_admin_write_v2
  ON public.student_membership_payments
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_credit_ledger_select_v2 ON public.student_credit_ledger;
CREATE POLICY student_credit_ledger_select_v2
  ON public.student_credit_ledger
  FOR SELECT
  USING (public.can_access_student(student_id));

DROP POLICY IF EXISTS student_credit_ledger_admin_write_v2 ON public.student_credit_ledger;
CREATE POLICY student_credit_ledger_admin_write_v2
  ON public.student_credit_ledger
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ----------------------------------------------------------------------------
-- COMMENTS
-- ----------------------------------------------------------------------------

COMMENT ON TABLE public.students IS
  'Alumno real del sistema. Separado de profiles para soportar cuentas de tutores y alumnos con acceso propio.';

COMMENT ON TABLE public.student_guardians IS
  'Relacion entre una cuenta tutor y un alumno. Regla actual: maximo un tutor por alumno.';

COMMENT ON TABLE public.student_memberships IS
  'Historial y estado actual de membresias por alumno.';

COMMENT ON TABLE public.student_membership_payments IS
  'Pagos reales de membresias con fechas y posibilidad de premios por puntualidad o constancia.';

COMMENT ON TABLE public.student_credit_ledger IS
  'Auditoria de movimientos de saldo de clases por alumno.';
