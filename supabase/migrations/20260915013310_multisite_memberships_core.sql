BEGIN;

-- ---------------------------------------------------------------------------
-- Locations and resource policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academy_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  maps_url text,
  timezone text NOT NULL DEFAULT 'America/Lima',
  opens_on date,
  is_active boolean NOT NULL DEFAULT true,
  capacity_policy text NOT NULL DEFAULT 'resource_based'
    CHECK (capacity_policy IN ('resource_based', 'fixed_operational')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.academy_locations (code, name, opens_on, capacity_policy, is_active)
VALUES
  ('tiabaya', 'Tiabaya', NULL, 'resource_based', true),
  ('umacollo', 'Umacollo', '2026-09-23', 'fixed_operational', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  opens_on = EXCLUDED.opens_on,
  capacity_policy = EXCLUDED.capacity_policy,
  updated_at = now();

ALTER TABLE public.weekly_session_templates
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.academy_locations(id),
  ADD COLUMN IF NOT EXISTS physical_capacity integer,
  ADD COLUMN IF NOT EXISTS regular_capacity integer,
  ADD COLUMN IF NOT EXISTS regular_distance_m integer,
  ADD COLUMN IF NOT EXISTS slots_per_target integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'flexible';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.academy_locations(id),
  ADD COLUMN IF NOT EXISTS physical_capacity integer,
  ADD COLUMN IF NOT EXISTS regular_capacity integer,
  ADD COLUMN IF NOT EXISTS capacity_policy text NOT NULL DEFAULT 'resource_based',
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'flexible';

UPDATE public.weekly_session_templates
SET location_id = (SELECT id FROM public.academy_locations WHERE code = 'tiabaya')
WHERE location_id IS NULL;

UPDATE public.sessions
SET location_id = (SELECT id FROM public.academy_locations WHERE code = 'tiabaya')
WHERE location_id IS NULL;

ALTER TABLE public.weekly_session_templates
  ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public.sessions
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.weekly_session_templates
  DROP CONSTRAINT IF EXISTS weekly_session_templates_booking_mode_check;
ALTER TABLE public.weekly_session_templates
  ADD CONSTRAINT weekly_session_templates_booking_mode_check
  CHECK (booking_mode IN ('flexible', 'fixed'));
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_booking_mode_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_booking_mode_check
  CHECK (booking_mode IN ('flexible', 'fixed'));

CREATE INDEX IF NOT EXISTS idx_sessions_location_start
  ON public.sessions(location_id, start_at);
CREATE INDEX IF NOT EXISTS idx_weekly_templates_location
  ON public.weekly_session_templates(location_id, weekday, start_time);

-- Individual assets make cross-location overlap validation possible. Assigned
-- equipment is deliberately outside the shared pool.
CREATE TABLE IF NOT EXISTS public.academy_bows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  draw_weight_lbs integer NOT NULL CHECK (draw_weight_lbs > 0),
  pool_type text NOT NULL DEFAULT 'shared'
    CHECK (pool_type IN ('shared', 'assigned')),
  assigned_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  operational_status text NOT NULL DEFAULT 'active'
    CHECK (operational_status IN ('active', 'maintenance', 'retired')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (pool_type = 'shared' AND assigned_student_id IS NULL)
    OR pool_type = 'assigned'
  )
);

INSERT INTO public.academy_bows (asset_code, draw_weight_lbs, pool_type, notes)
SELECT format('AA-20-%s', lpad(series::text, 2, '0')), 20, 'shared', 'Arco compartido de academia'
FROM generate_series(1, 6) AS series
ON CONFLICT (asset_code) DO NOTHING;

INSERT INTO public.academy_bows (asset_code, draw_weight_lbs, pool_type, notes)
SELECT format('AA-18-%s', lpad(series::text, 2, '0')), 18, 'shared', 'Arco prioritario para clases de prueba'
FROM generate_series(1, 2) AS series
ON CONFLICT (asset_code) DO NOTHING;

INSERT INTO public.academy_bows (
  asset_code, draw_weight_lbs, pool_type, assigned_student_id, notes
)
SELECT
  'ASSIGNED-' || st.id::text,
  COALESCE(st.bow_poundage, 20),
  'assigned',
  st.id,
  'Registro migrado desde el perfil deportivo; administración debe completar el código físico'
FROM public.students st
WHERE COALESCE(st.assigned_bow, false)
ON CONFLICT (asset_code) DO UPDATE SET
  assigned_student_id = EXCLUDED.assigned_student_id,
  draw_weight_lbs = EXCLUDED.draw_weight_lbs,
  pool_type = 'assigned';

CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_bows_one_assigned_per_student
  ON public.academy_bows(assigned_student_id)
  WHERE assigned_student_id IS NOT NULL AND operational_status = 'active';
CREATE INDEX IF NOT EXISTS idx_academy_bows_shared_active
  ON public.academy_bows(draw_weight_lbs, operational_status)
  WHERE pool_type = 'shared';

CREATE TABLE IF NOT EXISTS public.weekly_template_equipment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_template_id uuid NOT NULL REFERENCES public.weekly_session_templates(id) ON DELETE CASCADE,
  draw_weight_lbs integer NOT NULL CHECK (draw_weight_lbs > 0),
  quantity integer NOT NULL CHECK (quantity >= 0),
  priority_for_intro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (weekly_template_id, draw_weight_lbs)
);

CREATE TABLE IF NOT EXISTS public.session_equipment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  draw_weight_lbs integer NOT NULL CHECK (draw_weight_lbs > 0),
  quantity integer NOT NULL CHECK (quantity >= 0),
  priority_for_intro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, draw_weight_lbs)
);

-- ---------------------------------------------------------------------------
-- Purchase chain, recovery credits, recurrence and freezes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.membership_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  membership_plan_id uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  source_batch_id uuid UNIQUE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_memberships
  ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES public.membership_purchases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cycle_number integer;

INSERT INTO public.membership_purchases (
  id, student_id, membership_plan_id, source_batch_id, purchased_at, created_by, notes
)
SELECT DISTINCT ON (COALESCE(sm.assignment_batch_id, sm.id))
  COALESCE(sm.assignment_batch_id, sm.id),
  sm.student_id,
  sm.membership_plan_id,
  sm.assignment_batch_id,
  sm.created_at,
  sm.sold_by_profile_id,
  'Compra migrada desde ciclos existentes'
FROM public.student_memberships sm
ORDER BY COALESCE(sm.assignment_batch_id, sm.id), sm.start_date, sm.created_at, sm.id
ON CONFLICT (id) DO NOTHING;

UPDATE public.student_memberships sm
SET purchase_id = COALESCE(sm.assignment_batch_id, sm.id)
WHERE sm.purchase_id IS NULL;

WITH numbered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY purchase_id
      ORDER BY start_date, created_at, id
    )::integer AS cycle_number
  FROM public.student_memberships
)
UPDATE public.student_memberships sm
SET cycle_number = numbered.cycle_number
FROM numbered
WHERE numbered.id = sm.id
  AND sm.cycle_number IS NULL;

ALTER TABLE public.student_memberships
  ALTER COLUMN purchase_id SET NOT NULL,
  ALTER COLUMN cycle_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_cycles_purchase_number
  ON public.student_memberships(purchase_id, cycle_number);

CREATE TABLE IF NOT EXISTS public.membership_fixed_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.membership_purchases(id) ON DELETE CASCADE,
  weekly_template_id uuid NOT NULL REFERENCES public.weekly_session_templates(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_until date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'cancelled')),
  change_reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fixed_schedule_active_template
  ON public.membership_fixed_schedules(purchase_id, weekly_template_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.membership_recovery_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id) ON DELETE CASCADE,
  source_membership_id uuid REFERENCES public.student_memberships(id) ON DELETE SET NULL,
  classes_granted integer NOT NULL CHECK (classes_granted > 0),
  classes_remaining integer NOT NULL CHECK (classes_remaining >= 0 AND classes_remaining <= classes_granted),
  recovery_reason text NOT NULL CHECK (length(btrim(recovery_reason)) > 0),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_recovery_credit_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source public.student_memberships;
  v_receiver public.student_memberships;
BEGIN
  SELECT * INTO v_receiver FROM public.student_memberships WHERE id = NEW.student_membership_id;
  IF v_receiver.id IS NULL OR v_receiver.student_id <> NEW.student_id THEN
    RAISE EXCEPTION 'El ciclo receptor no pertenece al alumno indicado';
  END IF;
  IF NEW.source_membership_id IS NOT NULL THEN
    SELECT * INTO v_source FROM public.student_memberships WHERE id = NEW.source_membership_id;
    IF v_source.id IS NULL OR v_source.student_id <> NEW.student_id
      OR v_source.id = v_receiver.id OR v_source.start_date > v_receiver.start_date
    THEN
      RAISE EXCEPTION 'El ciclo de origen debe ser un ciclo anterior del mismo alumno';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recovery_credits_validate_source ON public.membership_recovery_credits;
CREATE TRIGGER recovery_credits_validate_source
  BEFORE INSERT OR UPDATE OF student_id, student_membership_id, source_membership_id
  ON public.membership_recovery_credits
  FOR EACH ROW EXECUTE FUNCTION public.validate_recovery_credit_source();

CREATE TABLE IF NOT EXISTS public.membership_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  membership_purchase_id uuid NOT NULL REFERENCES public.membership_purchases(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_membership_freezes_purchase_dates
  ON public.membership_freezes(membership_purchase_id, start_date, end_date)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.membership_time_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  membership_purchase_id uuid REFERENCES public.membership_purchases(id) ON DELETE CASCADE,
  student_membership_id uuid REFERENCES public.student_memberships(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('ordinary_justification', 'bulk_closure', 'freeze')),
  days_added integer NOT NULL CHECK (days_added > 0),
  weekly_extension_key text,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_time_adjustments_weekly_key
  ON public.membership_time_adjustments(weekly_extension_key)
  WHERE weekly_extension_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Booking origin, credit commitment and cancellation audit
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_source text NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS credit_kind text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS recovery_credit_id uuid REFERENCES public.membership_recovery_credits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_assignment_id uuid REFERENCES public.membership_fixed_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_occurrence_date date,
  ADD COLUMN IF NOT EXISTS manually_rescheduled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_source_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_source_check
  CHECK (booking_source IN ('flexible', 'recurring_fixed', 'admin_replacement', 'intro'));
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_credit_kind_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_credit_kind_check
  CHECK (credit_kind IN ('normal', 'recovery', 'not_applicable'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_recurrence_occurrence
  ON public.bookings(recurrence_assignment_id, original_occurrence_date)
  WHERE recurrence_assignment_id IS NOT NULL AND original_occurrence_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  cancellation_source text NOT NULL
    CHECK (cancellation_source IN ('student', 'academy', 'membership_freeze')),
  review_status text NOT NULL DEFAULT 'not_required'
    CHECK (review_status IN ('pending', 'resolved', 'not_required')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('justified', 'no_show')),
  admin_reason text,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (cancellation_source = 'student' AND review_status IN ('pending', 'resolved'))
    OR (cancellation_source <> 'student' AND review_status = 'not_required')
  )
);

CREATE TABLE IF NOT EXISTS public.booking_resource_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('target_space', 'shared_bow', 'assigned_bow')),
  academy_bow_id uuid REFERENCES public.academy_bows(id) ON DELETE SET NULL,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_resource_claims_active_type
  ON public.booking_resource_claims(booking_id, resource_type)
  WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_resource_claims_active_bow
  ON public.booking_resource_claims(academy_bow_id)
  WHERE released_at IS NULL AND academy_bow_id IS NOT NULL;

ALTER TABLE public.student_credit_ledger
  ADD COLUMN IF NOT EXISTS booking_cancellation_id uuid REFERENCES public.booking_cancellations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_cancellation_once
  ON public.student_credit_ledger(booking_cancellation_id)
  WHERE booking_cancellation_id IS NOT NULL;

ALTER TABLE public.student_credit_ledger
  DROP CONSTRAINT IF EXISTS student_credit_ledger_movement_type_check;
ALTER TABLE public.student_credit_ledger
  ADD CONSTRAINT student_credit_ledger_movement_type_check CHECK (
    movement_type IN (
      'membership_activation', 'booking_reserved', 'booking_cancelled_refund',
      'booking_cancelled_no_refund', 'booking_reservation_released',
      'attendance_consumed', 'weekly_no_show_consumed',
      'student_cancellation_no_show', 'recovery_granted', 'recovery_consumed',
      'admin_adjustment', 'reward_credit', 'migration_seed', 'migration_usage'
    )
  );

-- ---------------------------------------------------------------------------
-- Row-level access. Writes remain RPC-only for student-facing records.
-- ---------------------------------------------------------------------------
ALTER TABLE public.academy_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_bows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_template_equipment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_equipment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_fixed_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_recovery_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_time_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_resource_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academy_locations_authenticated_read ON public.academy_locations;
CREATE POLICY academy_locations_authenticated_read ON public.academy_locations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS academy_locations_admin_write ON public.academy_locations;
CREATE POLICY academy_locations_admin_write ON public.academy_locations
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS academy_bows_authenticated_read ON public.academy_bows;
CREATE POLICY academy_bows_authenticated_read ON public.academy_bows
  FOR SELECT TO authenticated USING (public.is_admin_user());
DROP POLICY IF EXISTS academy_bows_admin_write ON public.academy_bows;
CREATE POLICY academy_bows_admin_write ON public.academy_bows
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS multisite_admin_template_equipment ON public.weekly_template_equipment_allocations;
CREATE POLICY multisite_admin_template_equipment ON public.weekly_template_equipment_allocations
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
DROP POLICY IF EXISTS multisite_admin_session_equipment ON public.session_equipment_allocations;
CREATE POLICY multisite_admin_session_equipment ON public.session_equipment_allocations
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS membership_purchases_scoped_read ON public.membership_purchases;
CREATE POLICY membership_purchases_scoped_read ON public.membership_purchases
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));
DROP POLICY IF EXISTS membership_purchases_admin_write ON public.membership_purchases;
CREATE POLICY membership_purchases_admin_write ON public.membership_purchases
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS recovery_credits_scoped_read ON public.membership_recovery_credits;
CREATE POLICY recovery_credits_scoped_read ON public.membership_recovery_credits
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));
DROP POLICY IF EXISTS recovery_credits_admin_write ON public.membership_recovery_credits;
CREATE POLICY recovery_credits_admin_write ON public.membership_recovery_credits
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS freezes_scoped_read ON public.membership_freezes;
CREATE POLICY freezes_scoped_read ON public.membership_freezes
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));
DROP POLICY IF EXISTS freezes_admin_write ON public.membership_freezes;
CREATE POLICY freezes_admin_write ON public.membership_freezes
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS cancellations_scoped_read ON public.booking_cancellations;
CREATE POLICY cancellations_scoped_read ON public.booking_cancellations
  FOR SELECT TO authenticated USING (student_id IS NOT NULL AND public.can_access_student(student_id));
DROP POLICY IF EXISTS cancellations_admin_read ON public.booking_cancellations;
CREATE POLICY cancellations_admin_read ON public.booking_cancellations
  FOR SELECT TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS fixed_schedules_scoped_read ON public.membership_fixed_schedules;
CREATE POLICY fixed_schedules_scoped_read ON public.membership_fixed_schedules
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.membership_purchases mp
    WHERE mp.id = purchase_id AND public.can_access_student(mp.student_id)
  ));
DROP POLICY IF EXISTS fixed_schedules_admin_write ON public.membership_fixed_schedules;
CREATE POLICY fixed_schedules_admin_write ON public.membership_fixed_schedules
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS time_adjustments_scoped_read ON public.membership_time_adjustments;
CREATE POLICY time_adjustments_scoped_read ON public.membership_time_adjustments
  FOR SELECT TO authenticated USING (public.can_access_student(student_id));
DROP POLICY IF EXISTS time_adjustments_admin_write ON public.membership_time_adjustments;
CREATE POLICY time_adjustments_admin_write ON public.membership_time_adjustments
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS booking_resource_claims_scoped_read ON public.booking_resource_claims;
CREATE POLICY booking_resource_claims_scoped_read ON public.booking_resource_claims
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id
      AND (public.is_admin_user() OR (b.student_id IS NOT NULL AND public.can_access_student(b.student_id)))
  ));

REVOKE ALL ON TABLE public.membership_purchases, public.membership_fixed_schedules,
  public.membership_recovery_credits, public.membership_freezes,
  public.membership_time_adjustments, public.booking_cancellations,
  public.booking_resource_claims FROM anon;
GRANT SELECT ON TABLE public.academy_locations,
  public.membership_purchases, public.membership_fixed_schedules,
  public.membership_recovery_credits, public.membership_freezes,
  public.membership_time_adjustments, public.booking_cancellations,
  public.booking_resource_claims TO authenticated;

-- ---------------------------------------------------------------------------
-- Umacollo phase-one schedule. ISO weekday: Monday=1, Sunday=7.
-- ---------------------------------------------------------------------------
INSERT INTO public.weekly_session_templates (
  label, weekday, start_time, end_time, is_active, location_id,
  physical_capacity, regular_capacity, regular_distance_m,
  slots_per_target, booking_mode
)
SELECT seed.label, seed.weekday, seed.start_time, seed.end_time, seed.is_active,
  location.id, 4, 2, 10, 2, 'fixed'
FROM public.academy_locations location
CROSS JOIN (VALUES
  ('Umacollo Martes 17:00', 2::smallint, '17:00:00'::time, '18:00:00'::time, false),
  ('Umacollo Martes 18:00', 2::smallint, '18:00:00'::time, '19:00:00'::time, false),
  ('Umacollo Miércoles 17:00', 3::smallint, '17:00:00'::time, '18:00:00'::time, true),
  ('Umacollo Miércoles 18:00', 3::smallint, '18:00:00'::time, '19:00:00'::time, true),
  ('Umacollo Jueves 17:00', 4::smallint, '17:00:00'::time, '18:00:00'::time, true),
  ('Umacollo Jueves 18:00', 4::smallint, '18:00:00'::time, '19:00:00'::time, true),
  ('Umacollo Viernes 17:00', 5::smallint, '17:00:00'::time, '18:00:00'::time, true),
  ('Umacollo Viernes 18:00', 5::smallint, '18:00:00'::time, '19:00:00'::time, true)
) AS seed(label, weekday, start_time, end_time, is_active)
WHERE location.code = 'umacollo'
  AND NOT EXISTS (
    SELECT 1 FROM public.weekly_session_templates existing
    WHERE existing.location_id = location.id
      AND existing.weekday = seed.weekday
      AND existing.start_time = seed.start_time
  );

INSERT INTO public.weekly_session_template_distances (
  weekly_template_id, distance_m, slot_capacity, targets
)
SELECT template.id, 10, 4, 2
FROM public.weekly_session_templates template
JOIN public.academy_locations location ON location.id = template.location_id
WHERE location.code = 'umacollo'
ON CONFLICT (weekly_template_id, distance_m) DO UPDATE SET
  slot_capacity = 4,
  targets = 2,
  updated_at = now();

INSERT INTO public.weekly_template_equipment_allocations (
  weekly_template_id, draw_weight_lbs, quantity, priority_for_intro
)
SELECT template.id, allocation.draw_weight_lbs, allocation.quantity, allocation.priority_for_intro
FROM public.weekly_session_templates template
JOIN public.academy_locations location ON location.id = template.location_id
CROSS JOIN (VALUES
  (18, 2, true),
  (20, 2, false)
) AS allocation(draw_weight_lbs, quantity, priority_for_intro)
WHERE location.code = 'umacollo'
ON CONFLICT (weekly_template_id, draw_weight_lbs) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  priority_for_intro = EXCLUDED.priority_for_intro;

-- Existing Tiabaya sessions retain the six 20 lb shared bows and two distinct
-- 18 lb trial bows. Allocation is per time window, not permanent relocation.
INSERT INTO public.weekly_template_equipment_allocations (
  weekly_template_id, draw_weight_lbs, quantity, priority_for_intro
)
SELECT template.id, allocation.draw_weight_lbs, allocation.quantity, allocation.priority_for_intro
FROM public.weekly_session_templates template
JOIN public.academy_locations location ON location.id = template.location_id
CROSS JOIN (VALUES
  (18, 2, true),
  (20, 6, false)
) AS allocation(draw_weight_lbs, quantity, priority_for_intro)
WHERE location.code = 'tiabaya'
ON CONFLICT (weekly_template_id, draw_weight_lbs) DO NOTHING;

CREATE OR REPLACE FUNCTION public.apply_session_template_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_template public.weekly_session_templates;
BEGIN
  IF NEW.weekly_template_id IS NULL THEN
    IF NEW.location_id IS NULL THEN
      SELECT id INTO NEW.location_id FROM public.academy_locations WHERE code = 'tiabaya';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_template
  FROM public.weekly_session_templates
  WHERE id = NEW.weekly_template_id;

  IF v_template.id IS NOT NULL THEN
    NEW.location_id := v_template.location_id;
    NEW.physical_capacity := COALESCE(NEW.physical_capacity, v_template.physical_capacity);
    NEW.regular_capacity := COALESCE(NEW.regular_capacity, v_template.regular_capacity);
    NEW.booking_mode := v_template.booking_mode;
    NEW.capacity_policy := COALESCE(
      (SELECT capacity_policy FROM public.academy_locations WHERE id = v_template.location_id),
      'resource_based'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Purchase-aware creation and recurring fixed bookings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_membership_purchase_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid := COALESCE(NEW.purchase_id, NEW.assignment_batch_id, gen_random_uuid());
BEGIN
  INSERT INTO public.membership_purchases (
    id, student_id, membership_plan_id, source_batch_id,
    purchased_at, created_by, notes
  ) VALUES (
    v_purchase_id, NEW.student_id, NEW.membership_plan_id,
    NEW.assignment_batch_id, COALESCE(NEW.created_at, now()),
    NEW.sold_by_profile_id, 'Compra creada junto con sus ciclos'
  )
  ON CONFLICT (id) DO NOTHING;

  NEW.purchase_id := v_purchase_id;
  IF NEW.cycle_number IS NULL THEN
    SELECT COALESCE(MAX(sm.cycle_number), 0) + 1
    INTO NEW.cycle_number
    FROM public.student_memberships sm
    WHERE sm.purchase_id = v_purchase_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_memberships_attach_purchase_chain
  ON public.student_memberships;
CREATE TRIGGER student_memberships_attach_purchase_chain
  BEFORE INSERT ON public.student_memberships
  FOR EACH ROW EXECUTE FUNCTION public.attach_membership_purchase_chain();

CREATE OR REPLACE FUNCTION public.admin_generate_fixed_bookings(
  p_purchase_id uuid,
  p_effective_from date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_purchase public.membership_purchases;
  v_occurrence record;
  v_session_id uuid;
  v_booking_id uuid;
  v_availability jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_created integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden generar horarios fijos';
  END IF;

  SELECT * INTO v_purchase
  FROM public.membership_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;
  IF v_purchase.id IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;

  FOR v_occurrence IN
    SELECT
      fixed.id AS fixed_id,
      template.id AS template_id,
      day_value::date AS session_date,
      timezone(location.timezone, (day_value::date + template.start_time)::timestamp) AS start_at,
      timezone(location.timezone, (day_value::date + template.end_time)::timestamp) AS end_at,
      template.label,
      template.regular_distance_m,
      membership.id AS membership_id,
      student.self_profile_id,
      student.has_own_bow,
      student.assigned_bow,
      student.bow_poundage,
      student.current_distance_m
    FROM public.membership_fixed_schedules fixed
    JOIN public.weekly_session_templates template ON template.id = fixed.weekly_template_id
    JOIN public.academy_locations location ON location.id = template.location_id
    JOIN public.membership_purchases purchase ON purchase.id = fixed.purchase_id
    JOIN public.students student ON student.id = purchase.student_id
    CROSS JOIN LATERAL generate_series(
      GREATEST(fixed.effective_from, COALESCE(p_effective_from, fixed.effective_from)),
      COALESCE(
        fixed.effective_until,
        (SELECT MAX(sm.end_date) FROM public.student_memberships sm WHERE sm.purchase_id = fixed.purchase_id)
      ),
      interval '1 day'
    ) AS day_value
    JOIN public.student_memberships membership
      ON membership.purchase_id = fixed.purchase_id
     AND day_value::date BETWEEN membership.start_date AND membership.end_date
    WHERE fixed.purchase_id = p_purchase_id
      AND fixed.status = 'active'
      AND template.is_active = true
      AND location.is_active = true
      AND (location.opens_on IS NULL OR day_value::date >= location.opens_on)
      AND EXTRACT(ISODOW FROM day_value)::integer = template.weekday
      AND NOT EXISTS (
        SELECT 1 FROM public.membership_freezes membership_freeze
        WHERE membership_freeze.membership_purchase_id = fixed.purchase_id
          AND membership_freeze.status <> 'cancelled'
          AND day_value::date BETWEEN membership_freeze.start_date AND membership_freeze.end_date
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings existing
        WHERE existing.recurrence_assignment_id = fixed.id
          AND existing.original_occurrence_date = day_value::date
      )
    ORDER BY day_value, template.start_time
  LOOP
    SELECT session.id INTO v_session_id
    FROM public.sessions session
    WHERE session.weekly_template_id = v_occurrence.template_id
      AND session.start_at = v_occurrence.start_at;

    IF v_session_id IS NULL THEN
      INSERT INTO public.sessions (
        start_at, end_at, status, notes, weekly_template_id, is_manual_override
      ) VALUES (
        v_occurrence.start_at, v_occurrence.end_at, 'scheduled',
        v_occurrence.label, v_occurrence.template_id, false
      ) RETURNING id INTO v_session_id;

      INSERT INTO public.session_distance_allocations (
        session_id, distance_m, targets, slot_capacity
      )
      SELECT v_session_id, distance_m, targets, slot_capacity
      FROM public.weekly_session_template_distances
      WHERE weekly_template_id = v_occurrence.template_id
      ON CONFLICT (session_id, distance_m) DO NOTHING;
    END IF;

    v_availability := public.get_multisite_session_availability(
      v_session_id, v_purchase.student_id, false, NULL
    );
    IF NOT COALESCE((v_availability->>'available')::boolean, false) THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'date', v_occurrence.session_date,
        'template_id', v_occurrence.template_id,
        'reason', v_availability->>'message'
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_conflicts) > 0 THEN
    RAISE EXCEPTION 'CONFLICTOS_RECURRENTES:%', v_conflicts::text;
  END IF;

  FOR v_occurrence IN
    SELECT
      fixed.id AS fixed_id,
      template.id AS template_id,
      day_value::date AS session_date,
      timezone(location.timezone, (day_value::date + template.start_time)::timestamp) AS start_at,
      membership.id AS membership_id,
      student.self_profile_id,
      student.has_own_bow,
      student.assigned_bow,
      student.bow_poundage,
      COALESCE(template.regular_distance_m, student.current_distance_m) AS distance_m
    FROM public.membership_fixed_schedules fixed
    JOIN public.weekly_session_templates template ON template.id = fixed.weekly_template_id
    JOIN public.academy_locations location ON location.id = template.location_id
    JOIN public.membership_purchases purchase ON purchase.id = fixed.purchase_id
    JOIN public.students student ON student.id = purchase.student_id
    CROSS JOIN LATERAL generate_series(
      GREATEST(fixed.effective_from, COALESCE(p_effective_from, fixed.effective_from)),
      COALESCE(fixed.effective_until,
        (SELECT MAX(sm.end_date) FROM public.student_memberships sm WHERE sm.purchase_id = fixed.purchase_id)),
      interval '1 day'
    ) AS day_value
    JOIN public.student_memberships membership
      ON membership.purchase_id = fixed.purchase_id
     AND day_value::date BETWEEN membership.start_date AND membership.end_date
    WHERE fixed.purchase_id = p_purchase_id
      AND fixed.status = 'active'
      AND template.is_active = true
      AND location.is_active = true
      AND (location.opens_on IS NULL OR day_value::date >= location.opens_on)
      AND EXTRACT(ISODOW FROM day_value)::integer = template.weekday
      AND NOT EXISTS (
        SELECT 1 FROM public.membership_freezes membership_freeze
        WHERE membership_freeze.membership_purchase_id = fixed.purchase_id
          AND membership_freeze.status <> 'cancelled'
          AND day_value::date BETWEEN membership_freeze.start_date AND membership_freeze.end_date
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings existing
        WHERE existing.recurrence_assignment_id = fixed.id
          AND existing.original_occurrence_date = day_value::date
      )
      AND (
        SELECT COUNT(*) FROM public.bookings committed
        WHERE committed.active_membership_id = membership.id
          AND committed.credit_kind = 'normal'
          AND committed.status IN ('reserved', 'attended', 'no_show')
      ) < membership.classes_total
    ORDER BY day_value, template.start_time
  LOOP
    SELECT session.id INTO v_session_id
    FROM public.sessions session
    WHERE session.weekly_template_id = v_occurrence.template_id
      AND session.start_at = v_occurrence.start_at;

    INSERT INTO public.bookings (
      user_id, student_id, booked_by_profile_id, active_membership_id,
      session_id, status, distance_m, group_type, bow_usage_type,
      bow_poundage, booking_source, credit_kind, recurrence_assignment_id,
      original_occurrence_date, created_at, updated_at
    ) VALUES (
      COALESCE(v_occurrence.self_profile_id, v_actor_id), v_purchase.student_id,
      v_actor_id, v_occurrence.membership_id, v_session_id, 'reserved',
      v_occurrence.distance_m,
      (CASE WHEN v_occurrence.has_own_bow THEN 'ownbow'
        WHEN v_occurrence.assigned_bow THEN 'assigned' ELSE NULL END)::public.group_type,
      CASE WHEN v_occurrence.has_own_bow THEN 'own'
        WHEN v_occurrence.assigned_bow THEN 'assigned' ELSE 'shared_inventory' END,
      v_occurrence.bow_poundage, 'recurring_fixed', 'normal',
      v_occurrence.fixed_id, v_occurrence.session_date, now(), now()
    ) RETURNING id INTO v_booking_id;
    PERFORM public.claim_booking_resources(v_booking_id, false);
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created_bookings', v_created, 'conflicts', '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_student_membership_cycles(
  p_student_id uuid,
  p_membership_plan_id uuid,
  p_start_date date,
  p_period_count integer,
  p_origin text,
  p_gift_classes integer,
  p_gift_end_date date,
  p_total_amount numeric,
  p_payment_amount numeric,
  p_payment_type text,
  p_discount_type text,
  p_discount_value numeric,
  p_notes text,
  p_billing_date date,
  p_idempotency_key uuid,
  p_fixed_template_ids uuid[],
  p_recovery_classes integer,
  p_recovery_reason text,
  p_source_membership_id uuid
)
RETURNS SETOF public.student_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_purchase_id uuid;
  v_first_cycle_id uuid;
  v_last_end date;
  v_template_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden crear compras de membresia';
  END IF;
  IF COALESCE(array_length(p_fixed_template_ids, 1), 0) > 2 THEN
    RAISE EXCEPTION 'Umacollo permite seleccionar hasta dos horarios fijos';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_fixed_template_ids, ARRAY[]::uuid[])) WITH ORDINALITY left_id(id, position)
    JOIN public.weekly_session_templates left_template ON left_template.id = left_id.id
    JOIN unnest(COALESCE(p_fixed_template_ids, ARRAY[]::uuid[])) WITH ORDINALITY right_id(id, position)
      ON right_id.position > left_id.position
    JOIN public.weekly_session_templates right_template ON right_template.id = right_id.id
    WHERE left_template.weekday = right_template.weekday
      AND left_template.start_time < right_template.end_time
      AND right_template.start_time < left_template.end_time
  ) THEN
    RAISE EXCEPTION 'Los horarios fijos seleccionados se superponen';
  END IF;
  IF COALESCE(p_recovery_classes, 0) > 0
    AND NULLIF(btrim(COALESCE(p_recovery_reason, '')), '') IS NULL
  THEN RAISE EXCEPTION 'El motivo de recuperacion es obligatorio'; END IF;

  PERFORM public.admin_create_student_membership_cycles(
    p_student_id, p_membership_plan_id, p_start_date, p_period_count,
    p_origin, p_gift_classes, p_gift_end_date, p_total_amount,
    p_payment_amount, p_payment_type, p_discount_type, p_discount_value,
    p_notes, p_billing_date, p_idempotency_key
  );

  SELECT sm.purchase_id, sm.id
  INTO v_purchase_id, v_first_cycle_id
  FROM public.student_memberships sm
  WHERE sm.assignment_batch_id = p_idempotency_key
  ORDER BY sm.cycle_number
  LIMIT 1;
  SELECT MAX(sm.end_date) INTO v_last_end
  FROM public.student_memberships sm WHERE sm.purchase_id = v_purchase_id;

  IF COALESCE(array_length(p_fixed_template_ids, 1), 0) > (
    SELECT COALESCE(sm.weekly_class_target, 0)
    FROM public.student_memberships sm
    WHERE sm.id = v_first_cycle_id
  ) THEN
    RAISE EXCEPTION 'Los horarios fijos no pueden superar la frecuencia semanal del plan';
  END IF;

  IF COALESCE(p_recovery_classes, 0) > 0 THEN
    INSERT INTO public.membership_recovery_credits (
      student_id, student_membership_id, source_membership_id,
      classes_granted, classes_remaining, recovery_reason, granted_by
    )
    SELECT
      p_student_id, v_first_cycle_id, p_source_membership_id,
      p_recovery_classes, p_recovery_classes, btrim(p_recovery_reason), v_actor_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.membership_recovery_credits existing
      WHERE existing.student_membership_id = v_first_cycle_id
        AND existing.classes_granted = p_recovery_classes
        AND existing.recovery_reason = btrim(p_recovery_reason)
        AND existing.source_membership_id IS NOT DISTINCT FROM p_source_membership_id
    );
  END IF;

  FOREACH v_template_id IN ARRAY COALESCE(p_fixed_template_ids, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.weekly_session_templates template
      JOIN public.academy_locations location ON location.id = template.location_id
      WHERE template.id = v_template_id
        AND location.code = 'umacollo'
        AND template.booking_mode = 'fixed'
        AND template.is_active = true
    ) THEN RAISE EXCEPTION 'El horario fijo seleccionado no esta activo en Umacollo'; END IF;

    INSERT INTO public.membership_fixed_schedules (
      purchase_id, weekly_template_id, effective_from, effective_until, created_by
    ) VALUES (
      v_purchase_id, v_template_id, p_start_date, v_last_end, v_actor_id
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  IF COALESCE(array_length(p_fixed_template_ids, 1), 0) > 0 THEN
    PERFORM public.admin_generate_fixed_bookings(v_purchase_id, p_start_date);
  END IF;

  RETURN QUERY
  SELECT sm.* FROM public.student_memberships sm
  WHERE sm.purchase_id = v_purchase_id
  ORDER BY sm.cycle_number;
END;
$$;

DROP TRIGGER IF EXISTS sessions_apply_template_defaults ON public.sessions;
CREATE TRIGGER sessions_apply_template_defaults
  BEFORE INSERT OR UPDATE OF weekly_template_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.apply_session_template_defaults();

CREATE OR REPLACE FUNCTION public.copy_session_equipment_allocations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.weekly_template_id IS NOT NULL THEN
    INSERT INTO public.session_equipment_allocations (
      session_id, draw_weight_lbs, quantity, priority_for_intro
    )
    SELECT NEW.id, allocation.draw_weight_lbs, allocation.quantity, allocation.priority_for_intro
    FROM public.weekly_template_equipment_allocations allocation
    WHERE allocation.weekly_template_id = NEW.weekly_template_id
    ON CONFLICT (session_id, draw_weight_lbs) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      priority_for_intro = EXCLUDED.priority_for_intro;
  ELSE
    INSERT INTO public.session_equipment_allocations (
      session_id, draw_weight_lbs, quantity, priority_for_intro
    )
    SELECT NEW.id, defaults.draw_weight_lbs, defaults.quantity, defaults.priority_for_intro
    FROM public.academy_locations location
    CROSS JOIN LATERAL (
      VALUES
        (18, 2, true),
        (20, CASE WHEN location.code = 'umacollo' THEN 2 ELSE 6 END, false)
    ) AS defaults(draw_weight_lbs, quantity, priority_for_intro)
    WHERE location.id = NEW.location_id
    ON CONFLICT (session_id, draw_weight_lbs) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      priority_for_intro = EXCLUDED.priority_for_intro;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_copy_equipment_allocations ON public.sessions;
CREATE TRIGGER sessions_copy_equipment_allocations
  AFTER INSERT OR UPDATE OF weekly_template_id, location_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.copy_session_equipment_allocations();

INSERT INTO public.session_equipment_allocations (
  session_id, draw_weight_lbs, quantity, priority_for_intro
)
SELECT session.id, allocation.draw_weight_lbs, allocation.quantity, allocation.priority_for_intro
FROM public.sessions session
JOIN public.weekly_template_equipment_allocations allocation
  ON allocation.weekly_template_id = session.weekly_template_id
ON CONFLICT (session_id, draw_weight_lbs) DO NOTHING;

INSERT INTO public.session_equipment_allocations (
  session_id, draw_weight_lbs, quantity, priority_for_intro
)
SELECT session.id, defaults.draw_weight_lbs, defaults.quantity, defaults.priority_for_intro
FROM public.sessions session
JOIN public.academy_locations location ON location.id = session.location_id
CROSS JOIN LATERAL (
  VALUES
    (18, 2, true),
    (20, CASE WHEN location.code = 'umacollo' THEN 2 ELSE 6 END, false)
) AS defaults(draw_weight_lbs, quantity, priority_for_intro)
WHERE session.weekly_template_id IS NULL
ON CONFLICT (session_id, draw_weight_lbs) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Atomic capacity and resource claiming
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_multisite_session_availability(
  p_session_id uuid,
  p_student_id uuid DEFAULT NULL,
  p_is_intro boolean DEFAULT false,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions;
  v_location public.academy_locations;
  v_student public.students;
  v_usage text := 'shared_inventory';
  v_weight integer := 20;
  v_physical_capacity integer := 0;
  v_reserved integer := 0;
  v_regular_reserved integer := 0;
  v_physical_remaining integer := 0;
  v_regular_remaining integer := 0;
  v_allocated integer := 0;
  v_session_bows_used integer := 0;
  v_globally_free integer := 0;
  v_shared_remaining integer := 0;
  v_assigned_bow_available boolean := false;
  v_student_id uuid;
BEGIN
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  SELECT * INTO v_location
  FROM public.academy_locations
  WHERE id = v_session.location_id;

  IF p_student_id IS NOT NULL THEN
    v_student_id := CASE WHEN auth.uid() IS NULL THEN p_student_id
      ELSE public.resolve_accessible_student_id(p_student_id) END;
    SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
    v_usage := CASE
      WHEN COALESCE(v_student.has_own_bow, false) THEN 'own'
      WHEN COALESCE(v_student.assigned_bow, false) THEN 'assigned'
      ELSE 'shared_inventory'
    END;
    v_weight := COALESCE(v_student.bow_poundage, 20);
  ELSIF p_is_intro THEN
    -- 18 lb is a priority for trials, not an absolute restriction. If those
    -- assets are unavailable, 20 lb may be selected by the claim function.
    v_weight := 18;
  END IF;

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE b.student_id IS NOT NULL)::integer
  INTO v_reserved, v_regular_reserved
  FROM public.bookings b
  WHERE b.session_id = p_session_id AND b.status = 'reserved'
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id);

  SELECT COALESCE(
    v_session.physical_capacity,
    (SELECT SUM(COALESCE(sda.slot_capacity, sda.targets * 4))
     FROM public.session_distance_allocations sda WHERE sda.session_id = p_session_id),
    0
  )::integer INTO v_physical_capacity;

  IF v_location.code = 'umacollo' THEN
    v_physical_capacity := 4;
    v_regular_remaining := GREATEST(2 - v_regular_reserved, 0);
  ELSE
    v_regular_remaining := GREATEST(v_physical_capacity - v_regular_reserved, 0);
  END IF;
  v_physical_remaining := GREATEST(v_physical_capacity - v_reserved, 0);

  IF v_usage = 'shared_inventory' THEN
    SELECT COALESCE(sea.quantity, 0)
    INTO v_allocated
    FROM public.session_equipment_allocations sea
    WHERE sea.session_id = p_session_id AND sea.draw_weight_lbs = v_weight;

    SELECT COUNT(*)::integer INTO v_session_bows_used
    FROM public.booking_resource_claims claim
    JOIN public.academy_bows bow ON bow.id = claim.academy_bow_id
    WHERE claim.session_id = p_session_id
      AND claim.resource_type = 'shared_bow'
      AND claim.released_at IS NULL
      AND bow.draw_weight_lbs = v_weight;

    SELECT COUNT(*)::integer INTO v_globally_free
    FROM public.academy_bows bow
    WHERE bow.pool_type = 'shared'
      AND bow.operational_status = 'active'
      AND bow.draw_weight_lbs = v_weight
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_resource_claims claim
        JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
        WHERE claim.academy_bow_id = bow.id
          AND claim.released_at IS NULL
          AND occupied_session.start_at < v_session.end_at
          AND occupied_session.end_at > v_session.start_at
      );

    v_shared_remaining := GREATEST(LEAST(v_allocated - v_session_bows_used, v_globally_free), 0);

    IF p_is_intro AND v_weight = 18 AND v_shared_remaining = 0 THEN
      SELECT COALESCE(sea.quantity, 0) INTO v_allocated
      FROM public.session_equipment_allocations sea
      WHERE sea.session_id = p_session_id AND sea.draw_weight_lbs = 20;
      SELECT COUNT(*)::integer INTO v_session_bows_used
      FROM public.booking_resource_claims claim
      JOIN public.academy_bows bow ON bow.id = claim.academy_bow_id
      WHERE claim.session_id = p_session_id AND claim.resource_type = 'shared_bow'
        AND claim.released_at IS NULL AND bow.draw_weight_lbs = 20;
      SELECT COUNT(*)::integer INTO v_globally_free
      FROM public.academy_bows bow
      WHERE bow.pool_type = 'shared' AND bow.operational_status = 'active'
        AND bow.draw_weight_lbs = 20
        AND NOT EXISTS (
          SELECT 1 FROM public.booking_resource_claims claim
          JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
          WHERE claim.academy_bow_id = bow.id AND claim.released_at IS NULL
            AND occupied_session.start_at < v_session.end_at
            AND occupied_session.end_at > v_session.start_at
        );
      v_shared_remaining := GREATEST(LEAST(v_allocated - v_session_bows_used, v_globally_free), 0);
      IF v_shared_remaining > 0 THEN v_weight := 20; END IF;
    END IF;
  ELSIF v_usage = 'assigned' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.academy_bows bow
      WHERE bow.assigned_student_id = v_student.id
        AND bow.pool_type = 'assigned'
        AND bow.operational_status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.booking_resource_claims claim
          JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
          WHERE claim.academy_bow_id = bow.id
            AND claim.released_at IS NULL
            AND (p_exclude_booking_id IS NULL OR claim.booking_id <> p_exclude_booking_id)
            AND occupied_session.start_at < v_session.end_at
            AND occupied_session.end_at > v_session.start_at
        )
    ) INTO v_assigned_bow_available;
    v_shared_remaining := CASE WHEN v_assigned_bow_available THEN 1 ELSE 0 END;
  ELSE
    v_shared_remaining := v_physical_remaining;
  END IF;

  RETURN jsonb_build_object(
    'available', v_session.status = 'scheduled'
      AND v_physical_remaining > 0
      AND (p_is_intro OR v_location.code <> 'umacollo' OR v_regular_remaining > 0)
      AND (v_usage = 'own' OR v_shared_remaining > 0),
    'location_code', v_location.code,
    'capacity_policy', v_location.capacity_policy,
    'physical_capacity', v_physical_capacity,
    'physical_spots_remaining', v_physical_remaining,
    'regular_spots_remaining', v_regular_remaining,
    'shared_bows_remaining', v_shared_remaining,
    'selected_bow_weight', v_weight,
    'bow_usage_type', v_usage,
    'message', CASE
      WHEN v_physical_remaining <= 0 THEN 'No quedan espacios disponibles en paca'
      WHEN NOT p_is_intro AND v_location.code = 'umacollo' AND v_regular_remaining <= 0 THEN 'El turno ya tiene dos alumnos regulares'
      WHEN v_usage = 'shared_inventory' AND v_shared_remaining <= 0 THEN 'No queda un arco compartido compatible'
      WHEN v_usage = 'assigned' AND v_shared_remaining <= 0 THEN 'El arco asignado no esta disponible en este horario'
      ELSE 'Turno disponible'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_booking_resources(
  p_booking_id uuid,
  p_is_intro boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_session public.sessions;
  v_availability jsonb;
  v_bow_id uuid;
  v_weight integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions WHERE id = v_booking.session_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.booking_resource_claims claim
    WHERE claim.booking_id = p_booking_id
      AND claim.resource_type = 'target_space'
      AND claim.released_at IS NULL
  ) THEN
    RETURN;
  END IF;
  v_availability := public.get_multisite_session_availability(
    v_session.id, v_booking.student_id, p_is_intro, v_booking.id
  );
  IF NOT COALESCE((v_availability->>'available')::boolean, false) THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.booking_resource_claims (booking_id, session_id, resource_type)
  VALUES (v_booking.id, v_session.id, 'target_space')
  ON CONFLICT DO NOTHING;

  IF COALESCE(v_booking.bow_usage_type, 'shared_inventory') = 'shared_inventory' THEN
    v_weight := (v_availability->>'selected_bow_weight')::integer;
    SELECT bow.id INTO v_bow_id
    FROM public.academy_bows bow
    WHERE bow.pool_type = 'shared' AND bow.operational_status = 'active'
      AND bow.draw_weight_lbs = v_weight
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_resource_claims claim
        JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
        WHERE claim.academy_bow_id = bow.id AND claim.released_at IS NULL
          AND occupied_session.start_at < v_session.end_at
          AND occupied_session.end_at > v_session.start_at
      )
    ORDER BY bow.asset_code
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF v_bow_id IS NULL THEN RAISE EXCEPTION 'No queda un arco compartido compatible'; END IF;
    INSERT INTO public.booking_resource_claims (
      booking_id, session_id, resource_type, academy_bow_id
    ) VALUES (v_booking.id, v_session.id, 'shared_bow', v_bow_id);
    UPDATE public.bookings SET bow_poundage = v_weight WHERE id = v_booking.id;
  ELSIF v_booking.bow_usage_type = 'assigned' THEN
    SELECT bow.id INTO v_bow_id FROM public.academy_bows bow
    WHERE bow.assigned_student_id = v_booking.student_id
      AND bow.pool_type = 'assigned'
      AND bow.operational_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_resource_claims claim
        JOIN public.sessions occupied_session ON occupied_session.id = claim.session_id
        WHERE claim.academy_bow_id = bow.id
          AND claim.released_at IS NULL
          AND claim.booking_id <> v_booking.id
          AND occupied_session.start_at < v_session.end_at
          AND occupied_session.end_at > v_session.start_at
      )
    ORDER BY bow.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF v_bow_id IS NULL THEN
      RAISE EXCEPTION 'El arco asignado no esta disponible en este horario';
    END IF;
    INSERT INTO public.booking_resource_claims (
      booking_id, session_id, resource_type, academy_bow_id
    ) VALUES (v_booking.id, v_session.id, 'assigned_bow', v_bow_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_booking_resources(
  p_booking_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.booking_resource_claims
  SET released_at = COALESCE(released_at, now()),
      release_reason = COALESCE(release_reason, p_reason)
  WHERE booking_id = p_booking_id AND released_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.book_session_multisite(
  p_session uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_student_id uuid;
  v_student public.students;
  v_session public.sessions;
  v_location public.academy_locations;
  v_membership public.student_memberships;
  v_membership_id uuid;
  v_booking public.bookings;
  v_availability jsonb;
  v_session_date date;
  v_week_start date;
  v_credit_kind text;
  v_recovery_id uuid;
  v_day_cutoff timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);

  SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Alumno no encontrado'; END IF;
  IF COALESCE(v_student.operational_status, 'active') IN
    ('inactive', 'paused', 'retired', 'withdrawn', 'blocked', 'suspended')
  THEN RAISE EXCEPTION 'El alumno no esta activo para reservar'; END IF;
  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session FOR UPDATE;
  IF v_session.id IS NULL OR v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'La sesion no esta disponible';
  END IF;
  SELECT * INTO v_location FROM public.academy_locations WHERE id = v_session.location_id;
  IF v_location.code <> 'tiabaya' OR v_session.booking_mode <> 'flexible' THEN
    RAISE EXCEPTION 'Este turno se administra mediante horario fijo';
  END IF;
  IF v_session.start_at <= now() THEN RAISE EXCEPTION 'No puedes reservar una clase pasada'; END IF;

  v_session_date := (v_session.start_at AT TIME ZONE 'America/Lima')::date;
  v_week_start := v_session_date - (EXTRACT(ISODOW FROM v_session_date)::integer - 1);
  v_day_cutoff := public.get_booking_day_cutoff(v_session_date);
  IF v_day_cutoff IS NOT NULL AND now() >= v_day_cutoff THEN
    RAISE EXCEPTION 'Las reservas para este dia se cerraron 2 horas antes del primer turno';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.session_id = p_session AND b.student_id = v_student_id AND b.status = 'reserved'
  ) THEN RAISE EXCEPTION 'El alumno ya reservo esta sesion'; END IF;

  SELECT candidate.membership_id, candidate.credit_kind, candidate.recovery_id
  INTO v_membership_id, v_credit_kind, v_recovery_id
  FROM (
    SELECT
      sm.id AS membership_id,
      CASE
        WHEN (
          sm.classes_remaining > commitments.normal_commitments
          AND (sm.weekly_class_target = 0 OR weekly.normal_count < sm.weekly_class_target)
        ) THEN 'normal'
        ELSE 'recovery'
      END AS credit_kind,
      recovery.first_recovery_id AS recovery_id,
      sm.start_date,
      sm.created_at,
      sm.id
    FROM public.student_memberships sm
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(SUM(mrc.classes_remaining), 0)::integer AS total_recovery_remaining,
        (
          SELECT candidate_credit.id
          FROM public.membership_recovery_credits candidate_credit
          WHERE candidate_credit.student_membership_id = sm.id
            AND candidate_credit.classes_remaining > (
              SELECT COUNT(*)::integer
              FROM public.bookings committed_booking
              WHERE committed_booking.recovery_credit_id = candidate_credit.id
                AND (
                  committed_booking.status = 'reserved'
                  OR EXISTS (
                    SELECT 1 FROM public.booking_cancellations committed_cancellation
                    WHERE committed_cancellation.booking_id = committed_booking.id
                      AND committed_cancellation.review_status = 'pending'
                  )
                )
            )
          ORDER BY candidate_credit.created_at, candidate_credit.id
          LIMIT 1
        ) AS first_recovery_id
      FROM public.membership_recovery_credits mrc
      WHERE mrc.student_membership_id = sm.id
    ) recovery
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE b.credit_kind = 'normal')::integer AS normal_commitments,
        COUNT(*) FILTER (WHERE b.credit_kind = 'recovery')::integer AS recovery_commitments
      FROM public.bookings b
      WHERE b.active_membership_id = sm.id
        AND (
          b.status = 'reserved'
          OR EXISTS (
            SELECT 1 FROM public.booking_cancellations bc
            WHERE bc.booking_id = b.id AND bc.review_status = 'pending'
          )
        )
    ) commitments
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS normal_count
      FROM public.bookings b
      JOIN public.sessions weekly_session ON weekly_session.id = b.session_id
      WHERE b.active_membership_id = sm.id
        AND b.credit_kind = 'normal'
        AND (weekly_session.start_at AT TIME ZONE 'America/Lima')::date
          BETWEEN v_week_start AND v_week_start + 6
        AND (
          b.status IN ('reserved', 'attended', 'no_show')
          OR EXISTS (
            SELECT 1 FROM public.booking_cancellations bc
            WHERE bc.booking_id = b.id
              AND (bc.review_status = 'pending' OR bc.resolution = 'no_show')
          )
        )
    ) weekly
    WHERE sm.student_id = v_student_id
      AND sm.status = 'active'
      AND sm.start_date <= v_session_date
      AND (sm.end_date IS NULL OR sm.end_date >= v_session_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.membership_freezes mf
        WHERE mf.membership_purchase_id = sm.purchase_id
          AND mf.status <> 'cancelled'
          AND v_session_date BETWEEN mf.start_date AND mf.end_date
      )
      AND (
        (
          sm.classes_remaining > commitments.normal_commitments
          AND (sm.weekly_class_target = 0 OR weekly.normal_count < sm.weekly_class_target)
        )
        OR recovery.first_recovery_id IS NOT NULL
      )
    ORDER BY sm.start_date ASC, sm.created_at ASC, sm.id ASC
    FOR UPDATE OF sm
    LIMIT 1
  ) candidate;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'No existe una membresia elegible para la fecha, cuota y modalidad de esta sesion';
  END IF;
  SELECT * INTO v_membership
  FROM public.student_memberships
  WHERE id = v_membership_id;

  v_availability := public.get_multisite_session_availability(p_session, v_student_id, false, NULL);
  IF NOT COALESCE((v_availability->>'available')::boolean, false) THEN
    RAISE EXCEPTION '%', v_availability->>'message';
  END IF;

  INSERT INTO public.bookings (
    user_id, student_id, booked_by_profile_id, active_membership_id,
    session_id, status, distance_m, group_type, bow_usage_type,
    bow_poundage, booking_source, credit_kind, recovery_credit_id,
    created_at, updated_at
  ) VALUES (
    COALESCE(v_student.self_profile_id, v_actor_id), v_student_id, v_actor_id,
    v_membership.id, p_session, 'reserved', v_student.current_distance_m,
    (CASE WHEN v_student.has_own_bow THEN 'ownbow'
      WHEN v_student.assigned_bow THEN 'assigned' ELSE NULL END)::public.group_type,
    CASE WHEN v_student.has_own_bow THEN 'own'
      WHEN v_student.assigned_bow THEN 'assigned' ELSE 'shared_inventory' END,
    v_student.bow_poundage, 'flexible', v_credit_kind,
    CASE WHEN v_credit_kind = 'recovery' THEN v_recovery_id ELSE NULL END,
    now(), now()
  ) RETURNING * INTO v_booking;

  PERFORM public.claim_booking_resources(v_booking.id, false);
  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_multisite_sessions_for_student(
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
  spots_for_student integer,
  location_code text,
  location_name text,
  location_address text,
  booking_mode text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  RETURN QUERY
  SELECT
    session.id,
    session.start_at,
    session.end_at,
    session.status,
    EXISTS (
      SELECT 1 FROM public.bookings own_booking
      WHERE own_booking.session_id = session.id
        AND own_booking.student_id = v_student_id
        AND own_booking.status = 'reserved'
    ),
    student.current_distance_m,
    availability.data->>'bow_usage_type',
    LEAST(
      COALESCE((availability.data->>'physical_spots_remaining')::integer, 0),
      CASE WHEN availability.data->>'bow_usage_type' IN ('shared_inventory', 'assigned')
        THEN COALESCE((availability.data->>'shared_bows_remaining')::integer, 0)
        ELSE COALESCE((availability.data->>'physical_spots_remaining')::integer, 0)
      END
    ),
    location.code,
    location.name,
    location.address,
    session.booking_mode
  FROM public.sessions session
  JOIN public.academy_locations location ON location.id = session.location_id
  JOIN public.students student ON student.id = v_student_id
  CROSS JOIN LATERAL (
    SELECT public.get_multisite_session_availability(session.id, v_student_id, false, NULL) AS data
  ) availability
  WHERE location.code = 'tiabaya'
    AND session.booking_mode = 'flexible'
    AND session.status = 'scheduled'
    AND session.start_at > now()
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
    AND (
      public.get_booking_day_cutoff((session.start_at AT TIME ZONE 'America/Lima')::date) IS NULL
      OR now() < public.get_booking_day_cutoff((session.start_at AT TIME ZONE 'America/Lima')::date)
    )
  ORDER BY session.start_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- Student cancellation and administrative resolution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_session public.sessions;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.student_id IS NULL
    OR NOT public.can_access_student(v_booking.student_id)
  THEN RAISE EXCEPTION 'Reserva no encontrada o no autorizada'; END IF;

  IF v_booking.status = 'cancelled' AND EXISTS (
    SELECT 1 FROM public.booking_cancellations bc WHERE bc.booking_id = p_booking
  ) THEN RETURN v_booking; END IF;
  IF v_booking.status <> 'reserved' THEN
    RAISE EXCEPTION 'Solo puedes cancelar reservas activas';
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = v_booking.session_id FOR UPDATE;
  IF v_session.start_at < now() THEN
    RAISE EXCEPTION 'La reserva solo puede cancelarse hasta el inicio de la clase';
  END IF;

  INSERT INTO public.booking_cancellations (
    booking_id, student_id, cancellation_source, review_status,
    cancelled_by, cancelled_at
  ) VALUES (
    v_booking.id, v_booking.student_id, 'student', 'pending', v_actor_id, now()
  ) ON CONFLICT (booking_id) DO NOTHING;

  UPDATE public.bookings SET
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_id,
    cancelled_by_role = CASE
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor_id AND role = 'guardian')
        THEN 'guardian'
      ELSE 'student'
    END,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  PERFORM public.release_booking_resources(v_booking.id, 'student_pending_review');
  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_student_cancellation(
  p_cancellation_id uuid,
  p_resolution text,
  p_admin_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_cancellation public.booking_cancellations;
  v_booking public.bookings;
  v_membership public.student_memberships;
  v_recovery public.membership_recovery_credits;
  v_session public.sessions;
  v_balance integer;
  v_week_start date;
  v_week_end date;
  v_has_opportunity boolean := false;
  v_weekly_extension_key text;
  v_adjustment_inserted integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden resolver cancelaciones';
  END IF;
  IF p_resolution NOT IN ('justified', 'no_show') THEN
    RAISE EXCEPTION 'Resolucion invalida';
  END IF;
  IF p_resolution = 'justified' AND NULLIF(btrim(COALESCE(p_admin_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo administrativo es obligatorio';
  END IF;

  SELECT * INTO v_cancellation
  FROM public.booking_cancellations
  WHERE id = p_cancellation_id
  FOR UPDATE;
  IF v_cancellation.id IS NULL OR v_cancellation.cancellation_source <> 'student' THEN
    RAISE EXCEPTION 'Cancelacion de alumno no encontrada';
  END IF;
  IF v_cancellation.review_status = 'resolved' THEN
    RETURN jsonb_build_object(
      'success', true, 'already_resolved', true,
      'resolution', v_cancellation.resolution
    );
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_cancellation.booking_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions WHERE id = v_booking.session_id FOR UPDATE;
  SELECT * INTO v_membership
  FROM public.student_memberships WHERE id = v_booking.active_membership_id FOR UPDATE;
  IF v_membership.id IS NULL THEN RAISE EXCEPTION 'Membresia vinculada no encontrada'; END IF;

  IF p_resolution = 'no_show' THEN
    IF v_booking.credit_kind = 'recovery' THEN
      SELECT * INTO v_recovery
      FROM public.membership_recovery_credits
      WHERE id = v_booking.recovery_credit_id
      FOR UPDATE;
      IF v_recovery.id IS NULL OR v_recovery.classes_remaining <= 0 THEN
        RAISE EXCEPTION 'La recuperacion vinculada ya no esta disponible';
      END IF;
       UPDATE public.membership_recovery_credits
       SET classes_remaining = classes_remaining - 1, updated_at = now()
       WHERE id = v_recovery.id
       RETURNING classes_remaining INTO v_balance;
     ELSE
       UPDATE public.student_memberships SET
         classes_used = classes_used + 1,
         classes_remaining = classes_remaining - 1,
         updated_at = now()
       WHERE id = v_membership.id AND classes_remaining > 0
       RETURNING classes_remaining INTO v_balance;
     END IF;
    IF v_balance IS NULL THEN RAISE EXCEPTION 'La membresia no tiene saldo disponible'; END IF;

    INSERT INTO public.student_credit_ledger (
      student_id, student_membership_id, booking_id,
      booking_cancellation_id, movement_type, delta, balance_after,
      reason, performed_by_profile_id
    ) VALUES (
      v_booking.student_id, v_membership.id, v_booking.id,
      v_cancellation.id, 'student_cancellation_no_show', -1, v_balance,
      COALESCE(NULLIF(btrim(p_admin_reason), ''), 'Cancelacion del alumno reclasificada como inasistencia'),
      v_actor_id
    ) ON CONFLICT (booking_cancellation_id) WHERE booking_cancellation_id IS NOT NULL DO NOTHING;
    UPDATE public.bookings SET
      status = 'no_show', attendance_marked_by = v_actor_id,
      attendance_marked_at = now(), updated_at = now()
    WHERE id = v_booking.id;
  ELSE
    v_week_start := (v_session.start_at AT TIME ZONE 'America/Lima')::date
      - (EXTRACT(ISODOW FROM (v_session.start_at AT TIME ZONE 'America/Lima')::date)::integer - 1);
    v_week_end := v_week_start + 6;

    IF v_week_end >= (now() AT TIME ZONE 'America/Lima')::date
      AND (v_membership.end_date IS NULL OR v_membership.end_date >= (now() AT TIME ZONE 'America/Lima')::date)
    THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.get_available_multisite_sessions_for_student(
          v_booking.student_id,
          (now() AT TIME ZONE 'America/Lima')::date,
          LEAST(v_week_end, COALESCE(v_membership.end_date, v_week_end))
        ) available_session
        WHERE available_session.start_at > now()
          AND available_session.spots_for_student > 0
          AND (
            public.get_booking_day_cutoff(
              (available_session.start_at AT TIME ZONE 'America/Lima')::date
            ) IS NULL
            OR now() < public.get_booking_day_cutoff(
              (available_session.start_at AT TIME ZONE 'America/Lima')::date
            )
          )
      ) INTO v_has_opportunity;
    END IF;

    IF NOT v_has_opportunity THEN
      v_weekly_extension_key := v_booking.student_id::text || ':' || v_week_start::text;
      INSERT INTO public.membership_time_adjustments (
        student_id, membership_purchase_id, student_membership_id,
        adjustment_type, days_added, weekly_extension_key, reason, created_by
      ) VALUES (
        v_booking.student_id, v_membership.purchase_id, v_membership.id,
        'ordinary_justification', 7, v_weekly_extension_key,
        btrim(p_admin_reason), v_actor_id
      ) ON CONFLICT (weekly_extension_key) WHERE weekly_extension_key IS NOT NULL DO NOTHING;
      GET DIAGNOSTICS v_adjustment_inserted = ROW_COUNT;

       IF v_adjustment_inserted = 1 THEN
        UPDATE public.student_memberships
        SET end_date = (end_date + interval '7 days')::date, updated_at = now()
        WHERE id = v_membership.id AND end_date IS NOT NULL;
        UPDATE public.student_memberships
        SET start_date = (start_date + interval '7 days')::date,
            end_date = CASE WHEN end_date IS NULL THEN NULL ELSE (end_date + interval '7 days')::date END,
            updated_at = now()
         WHERE purchase_id = v_membership.purchase_id
           AND cycle_number > v_membership.cycle_number;
        UPDATE public.membership_fixed_schedules SET
          effective_until = CASE WHEN effective_until IS NULL THEN NULL ELSE effective_until + 7 END,
          updated_at = now()
        WHERE purchase_id = v_membership.purchase_id AND status = 'active';
        PERFORM public.admin_generate_fixed_bookings(v_membership.purchase_id, v_week_end + 1);
       END IF;
    END IF;
  END IF;

  UPDATE public.booking_cancellations SET
    review_status = 'resolved', resolution = p_resolution,
    admin_reason = NULLIF(btrim(COALESCE(p_admin_reason, '')), ''),
    resolved_by = v_actor_id, resolved_at = now()
  WHERE id = v_cancellation.id;

  PERFORM public.sync_student_membership_operational_status(v_booking.student_id);
  RETURN jsonb_build_object(
    'success', true,
    'already_resolved', false,
    'resolution', p_resolution,
    'classes_remaining', COALESCE(v_balance, v_membership.classes_remaining),
    'extension_applied', v_adjustment_inserted = 1,
    'has_valid_opportunity', v_has_opportunity
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Administrative freeze with exact-day chain displacement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_booking_with_frozen_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session_date date;
BEGIN
  IF NEW.status <> 'reserved' OR NEW.active_membership_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (session.start_at AT TIME ZONE COALESCE(location.timezone, 'America/Lima'))::date
  INTO v_session_date
  FROM public.sessions session
  LEFT JOIN public.academy_locations location ON location.id = session.location_id
  WHERE session.id = NEW.session_id;

  IF EXISTS (
    SELECT 1
    FROM public.student_memberships membership
    WHERE membership.id = NEW.active_membership_id
      AND (
        EXISTS (
          SELECT 1 FROM public.membership_freezes membership_freeze
          WHERE membership_freeze.membership_purchase_id = membership.purchase_id
            AND membership_freeze.status <> 'cancelled'
            AND v_session_date BETWEEN membership_freeze.start_date AND membership_freeze.end_date
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.membership_freezes membership_freeze
            WHERE membership_freeze.membership_purchase_id = membership.purchase_id
              AND membership_freeze.status <> 'cancelled'
          )
          AND membership.frozen_at IS NOT NULL
          AND v_session_date >= (membership.frozen_at AT TIME ZONE 'America/Lima')::date
          AND (membership.frozen_until IS NULL OR v_session_date <= membership.frozen_until)
        )
      )
  ) THEN
    RAISE EXCEPTION 'La membresia esta congelada para la fecha de esta sesion';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_membership_freeze(
  p_purchase_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_purchase public.membership_purchases;
  v_cycle public.student_memberships;
  v_freeze_id uuid;
  v_duration integer;
  v_booking_id uuid;
  v_cancelled integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden congelar membresias';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Rango de congelamiento invalido';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  v_duration := p_end_date - p_start_date + 1;

  SELECT * INTO v_purchase
  FROM public.membership_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_purchase.id IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.membership_freezes mf
    WHERE mf.membership_purchase_id = p_purchase_id
      AND mf.status <> 'cancelled'
      AND daterange(mf.start_date, mf.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN RAISE EXCEPTION 'El periodo se superpone con otro congelamiento'; END IF;

  SELECT * INTO v_cycle
  FROM public.student_memberships sm
  WHERE sm.purchase_id = p_purchase_id
    AND sm.start_date <= p_start_date
    AND (sm.end_date IS NULL OR sm.end_date >= p_start_date)
  ORDER BY sm.cycle_number
  FOR UPDATE
  LIMIT 1;
  IF v_cycle.id IS NULL THEN
    RAISE EXCEPTION 'El congelamiento debe comenzar dentro de un ciclo de la compra';
  END IF;

  INSERT INTO public.membership_freezes (
    student_id, membership_purchase_id, start_date, end_date,
    duration_days, reason, notes, created_by
  ) VALUES (
    v_purchase.student_id, p_purchase_id, p_start_date, p_end_date,
    v_duration, btrim(p_reason), NULLIF(btrim(COALESCE(p_notes, '')), ''), v_actor_id
  ) RETURNING id INTO v_freeze_id;

  FOR v_booking_id IN
    SELECT b.id
    FROM public.bookings b
    JOIN public.sessions s ON s.id = b.session_id
    JOIN public.student_memberships sm ON sm.id = b.active_membership_id
    WHERE sm.purchase_id = p_purchase_id
      AND b.status = 'reserved'
      AND s.start_at > now()
      AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN p_start_date AND p_end_date
    FOR UPDATE OF b
  LOOP
    INSERT INTO public.booking_cancellations (
      booking_id, student_id, cancellation_source, review_status,
      admin_reason, cancelled_by
    ) VALUES (
      v_booking_id, v_purchase.student_id, 'membership_freeze', 'not_required',
      btrim(p_reason), v_actor_id
    ) ON CONFLICT (booking_id) DO NOTHING;
    UPDATE public.bookings SET
      status = 'cancelled', cancelled_by_profile_id = v_actor_id,
      cancelled_by_role = 'admin', cancelled_at = now(), updated_at = now()
    WHERE id = v_booking_id;
    PERFORM public.release_booking_resources(v_booking_id, 'membership_freeze');
    v_cancelled := v_cancelled + 1;
  END LOOP;

  UPDATE public.student_memberships SET
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE end_date + v_duration END,
    frozen_at = p_start_date::timestamptz,
    frozen_until = p_end_date,
    updated_at = now()
  WHERE id = v_cycle.id;

  UPDATE public.student_memberships SET
    start_date = start_date + v_duration,
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE end_date + v_duration END,
    updated_at = now()
  WHERE purchase_id = p_purchase_id AND cycle_number > v_cycle.cycle_number;

  UPDATE public.membership_fixed_schedules SET
    effective_until = CASE
      WHEN effective_until IS NULL THEN NULL
      ELSE effective_until + v_duration
    END,
    updated_at = now()
  WHERE purchase_id = p_purchase_id AND status = 'active';

  INSERT INTO public.membership_time_adjustments (
    student_id, membership_purchase_id, student_membership_id,
    adjustment_type, days_added, reason, created_by
  ) VALUES (
    v_purchase.student_id, p_purchase_id, v_cycle.id,
    'freeze', v_duration, btrim(p_reason), v_actor_id
  );

  -- Rebuild only the displaced tail. Occurrences cancelled by this freeze remain
  -- protected by their unique recurrence/original-occurrence record.
  PERFORM public.admin_generate_fixed_bookings(p_purchase_id, p_end_date + 1);

  RETURN jsonb_build_object(
    'success', true, 'freeze_id', v_freeze_id,
    'duration_days', v_duration, 'cancelled_bookings', v_cancelled,
    'new_cycle_end', CASE WHEN v_cycle.end_date IS NULL THEN NULL ELSE v_cycle.end_date + v_duration END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finish_membership_freeze(
  p_purchase_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
  v_freeze public.membership_freezes;
  v_cycle public.student_memberships;
  v_unused_days integer;
  v_resume_date date;
  v_booking_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden finalizar congelamientos';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  SELECT * INTO v_freeze
  FROM public.membership_freezes
  WHERE membership_purchase_id = p_purchase_id
    AND status = 'active'
    AND end_date >= v_today
  ORDER BY start_date, created_at
  FOR UPDATE
  LIMIT 1;
  IF v_freeze.id IS NULL THEN RAISE EXCEPTION 'No existe un congelamiento activo o futuro'; END IF;

  v_resume_date := GREATEST(v_today, v_freeze.start_date);
  v_unused_days := v_freeze.end_date - v_resume_date + 1;

  SELECT * INTO v_cycle
  FROM public.student_memberships membership
  WHERE membership.purchase_id = p_purchase_id
    AND membership.start_date <= v_freeze.start_date
    AND (membership.end_date IS NULL OR membership.end_date >= v_freeze.start_date)
  ORDER BY membership.cycle_number
  FOR UPDATE
  LIMIT 1;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'No se encontro el ciclo afectado'; END IF;

  UPDATE public.student_memberships SET
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE end_date - v_unused_days END,
    frozen_at = NULL, frozen_until = NULL, updated_at = now()
  WHERE id = v_cycle.id;
  UPDATE public.student_memberships SET
    start_date = start_date - v_unused_days,
    end_date = CASE WHEN end_date IS NULL THEN NULL ELSE end_date - v_unused_days END,
    updated_at = now()
  WHERE purchase_id = p_purchase_id AND cycle_number > v_cycle.cycle_number;
  UPDATE public.membership_fixed_schedules SET
    effective_until = CASE WHEN effective_until IS NULL THEN NULL ELSE effective_until - v_unused_days END,
    updated_at = now()
  WHERE purchase_id = p_purchase_id AND status = 'active';

  UPDATE public.membership_freezes SET
    status = CASE WHEN v_freeze.start_date >= v_today THEN 'cancelled' ELSE 'completed' END,
    end_date = CASE WHEN v_freeze.start_date >= v_today THEN end_date ELSE v_today - 1 END,
    duration_days = CASE WHEN v_freeze.start_date >= v_today THEN duration_days ELSE duration_days - v_unused_days END,
    notes = concat_ws(E'\n', notes, 'Finalizado anticipadamente: ' || btrim(p_reason))
  WHERE id = v_freeze.id;

  FOR v_booking_id IN
    SELECT booking.id
    FROM public.bookings booking
    JOIN public.sessions session ON session.id = booking.session_id
    JOIN public.student_memberships membership ON membership.id = booking.active_membership_id
    JOIN public.booking_cancellations cancellation ON cancellation.booking_id = booking.id
    WHERE membership.purchase_id = p_purchase_id
      AND booking.recurrence_assignment_id IS NOT NULL
      AND booking.status = 'cancelled'
      AND cancellation.cancellation_source = 'membership_freeze'
      AND cancellation.review_status = 'not_required'
      AND (session.start_at AT TIME ZONE 'America/Lima')::date
        BETWEEN v_resume_date AND v_freeze.end_date
    FOR UPDATE OF booking
  LOOP
    UPDATE public.booking_cancellations SET
      admin_reason = concat_ws(E'\n', admin_reason, 'Congelamiento revertido: ' || btrim(p_reason))
    WHERE booking_id = v_booking_id;
    UPDATE public.bookings SET
      status = 'reserved', cancelled_at = NULL, cancelled_by_profile_id = NULL,
      cancelled_by_role = NULL,
      admin_notes = concat_ws(E'\n', admin_notes, 'Reserva fija restaurada tras reactivación'),
      updated_at = now()
    WHERE id = v_booking_id;
  END LOOP;

  PERFORM public.admin_generate_fixed_bookings(p_purchase_id, v_resume_date);
  RETURN jsonb_build_object('success', true, 'unused_days_reversed', v_unused_days,
    'resume_date', v_resume_date, 'freeze_id', v_freeze.id);
END;
$$;

-- Preserve existing freezes before the legacy columns are retired in a later release.
INSERT INTO public.membership_freezes (
  student_id, membership_purchase_id, start_date, end_date,
  duration_days, reason, notes, created_by, status
)
SELECT
  sm.student_id, sm.purchase_id,
  (sm.frozen_at AT TIME ZONE 'America/Lima')::date,
  sm.frozen_until,
  sm.frozen_until - (sm.frozen_at AT TIME ZONE 'America/Lima')::date + 1,
  'Congelamiento migrado', 'Migrado desde frozen_at/frozen_until',
  sm.sold_by_profile_id,
  CASE WHEN sm.frozen_until < current_date THEN 'completed' ELSE 'active' END
FROM public.student_memberships sm
WHERE sm.frozen_at IS NOT NULL
  AND sm.frozen_until IS NOT NULL
  AND sm.frozen_until >= (sm.frozen_at AT TIME ZONE 'America/Lima')::date
  AND NOT EXISTS (
    SELECT 1 FROM public.membership_freezes existing
    WHERE existing.membership_purchase_id = sm.purchase_id
      AND existing.start_date = (sm.frozen_at AT TIME ZONE 'America/Lima')::date
      AND existing.end_date = sm.frozen_until
  );

CREATE OR REPLACE FUNCTION public.get_student_week_overview(
  p_student_id uuid DEFAULT NULL,
  p_reference_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_week_start date;
  v_classes jsonb;
  v_normal_remaining integer;
  v_recovery_remaining integer;
  v_weekly_target integer;
  v_weekly_completed integer;
  v_pending integer;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  v_week_start := p_reference_date - (EXTRACT(ISODOW FROM p_reference_date)::integer - 1);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', b.id,
    'start_at', s.start_at,
    'end_at', s.end_at,
    'distance_m', b.distance_m,
    'status', b.status,
    'booking_source', b.booking_source,
    'credit_kind', b.credit_kind,
    'location_name', location.name,
    'location_address', location.address
  ) ORDER BY s.start_at), '[]'::jsonb)
  INTO v_classes
  FROM public.bookings b
  JOIN public.sessions s ON s.id = b.session_id
  JOIN public.academy_locations location ON location.id = s.location_id
  WHERE b.student_id = v_student_id
    AND (s.start_at AT TIME ZONE location.timezone)::date
      BETWEEN v_week_start AND v_week_start + 6
    AND b.status IN ('reserved', 'attended', 'no_show');

  SELECT
    COALESCE(SUM(GREATEST(sm.classes_remaining - commitments.normal_reserved, 0)), 0)::integer,
    COALESCE(SUM(GREATEST(COALESCE(recovery.remaining, 0) - commitments.recovery_reserved, 0)), 0)::integer,
    COALESCE(MAX(sm.weekly_class_target), 0)::integer
  INTO v_normal_remaining, v_recovery_remaining, v_weekly_target
  FROM public.student_memberships sm
  LEFT JOIN LATERAL (
    SELECT SUM(mrc.classes_remaining)::integer AS remaining
    FROM public.membership_recovery_credits mrc
    WHERE mrc.student_membership_id = sm.id
  ) recovery ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE booking.credit_kind = 'normal')::integer AS normal_reserved,
      COUNT(*) FILTER (WHERE booking.credit_kind = 'recovery')::integer AS recovery_reserved
    FROM public.bookings booking
    WHERE booking.active_membership_id = sm.id
      AND (
        booking.status = 'reserved'
        OR EXISTS (
          SELECT 1 FROM public.booking_cancellations cancellation
          WHERE cancellation.booking_id = booking.id AND cancellation.review_status = 'pending'
        )
      )
  ) commitments ON true
  WHERE sm.student_id = v_student_id
    AND sm.status = 'active'
    AND sm.start_date <= v_week_start + 6
    AND (sm.end_date IS NULL OR sm.end_date >= v_week_start);

  SELECT COUNT(*)::integer INTO v_weekly_completed
  FROM public.bookings b
  JOIN public.sessions s ON s.id = b.session_id
  WHERE b.student_id = v_student_id
    AND b.credit_kind = 'normal'
    AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_week_start AND v_week_start + 6
    AND b.status IN ('reserved', 'attended', 'no_show');

  SELECT COUNT(*)::integer INTO v_pending
  FROM public.booking_cancellations cancellation
  WHERE cancellation.student_id = v_student_id
    AND cancellation.review_status = 'pending';

  RETURN jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_start + 6,
    'classes', v_classes,
    'normal_classes_remaining', COALESCE(v_normal_remaining, 0),
    'recovery_classes_remaining', COALESCE(v_recovery_remaining, 0),
    'weekly_target', COALESCE(v_weekly_target, 0),
    'weekly_completed', COALESCE(v_weekly_completed, 0),
    'pending_cancellations', COALESCE(v_pending, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_attendance_review(p_sunday date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_week_start date;
  v_pending_count integer;
  v_candidates jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden revisar inasistencias semanales';
  END IF;
  IF p_sunday IS NULL OR EXTRACT(DOW FROM p_sunday) <> 0 THEN
    RETURN jsonb_build_object('is_sunday', false, 'week_start', NULL,
      'week_end', p_sunday, 'pending_count', 0, 'candidates', '[]'::jsonb);
  END IF;
  IF p_sunday > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'No se puede revisar una semana futura';
  END IF;
  v_week_start := p_sunday - 6;

  SELECT COUNT(*)::integer INTO v_pending_count
  FROM public.bookings booking
  JOIN public.sessions session ON session.id = booking.session_id
  WHERE booking.status = 'reserved'
    AND booking.student_id IS NOT NULL
    AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_week_start AND p_sunday;

  WITH cancellation_candidates AS (
    SELECT
      cancellation.student_id,
      student.full_name AS student_name,
      student.avatar_url,
      booking.active_membership_id AS membership_id,
      membership.custom_name AS membership_name,
      membership.end_date AS membership_end,
      membership.classes_remaining,
      membership.classes_remaining AS membership_available_classes,
      membership.classes_remaining AS available_classes,
      CASE WHEN membership.end_date <= p_sunday + 7 THEN 'expiring' ELSE 'active' END AS membership_display_status,
      membership.weekly_class_target,
      0::integer AS attended_count,
      0::integer AS booking_no_show_count,
      0::integer AS weekly_no_show_count,
      0::integer AS completed_count,
      1::integer AS missing_count,
      'student_cancellation'::text AS candidate_type,
      cancellation.id AS cancellation_id,
      booking.id AS booking_id,
      session.start_at,
      location.name AS location_name
    FROM public.booking_cancellations cancellation
    JOIN public.bookings booking ON booking.id = cancellation.booking_id
    JOIN public.sessions session ON session.id = booking.session_id
    JOIN public.academy_locations location ON location.id = session.location_id
    JOIN public.students student ON student.id = cancellation.student_id
    JOIN public.student_memberships membership ON membership.id = booking.active_membership_id
    WHERE cancellation.cancellation_source = 'student'
      AND cancellation.review_status = 'pending'
      AND (session.start_at AT TIME ZONE location.timezone)::date BETWEEN v_week_start AND p_sunday
  ), quota_candidates AS (
    SELECT
      student.id AS student_id,
      student.full_name AS student_name,
      student.avatar_url,
      membership.id AS membership_id,
      membership.custom_name AS membership_name,
      membership.end_date AS membership_end,
      membership.classes_remaining,
      membership.classes_remaining AS membership_available_classes,
      membership.classes_remaining AS available_classes,
      CASE WHEN membership.end_date <= p_sunday + 7 THEN 'expiring' ELSE 'active' END AS membership_display_status,
      membership.weekly_class_target,
      counts.attended_count,
      counts.booking_no_show_count,
      counts.weekly_no_show_count,
      counts.completed_count,
      LEAST(GREATEST(membership.weekly_class_target - counts.completed_count - counts.pending_cancellations, 0),
        membership.classes_remaining)::integer AS missing_count,
      'unreserved_quota'::text AS candidate_type,
      NULL::uuid AS cancellation_id,
      NULL::uuid AS booking_id,
      NULL::timestamptz AS start_at,
      NULL::text AS location_name
    FROM public.students student
    JOIN LATERAL (
      SELECT sm.* FROM public.student_memberships sm
      WHERE sm.student_id = student.id
        AND sm.status = 'active'
        AND sm.weekly_class_target > 0
        AND NOT (sm.start_date > v_week_start)
        AND (sm.end_date IS NULL OR NOT (sm.end_date < p_sunday))
        AND NOT EXISTS (
          SELECT 1 FROM public.membership_freezes membership_freeze
          WHERE membership_freeze.membership_purchase_id = sm.purchase_id
            AND membership_freeze.status <> 'cancelled'
            AND daterange(membership_freeze.start_date, membership_freeze.end_date, '[]')
              && daterange(v_week_start, p_sunday, '[]')
        )
      ORDER BY sm.start_date, sm.created_at, sm.id LIMIT 1
    ) membership ON true
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE booking.status = 'attended')::integer AS attended_count,
        COUNT(*) FILTER (WHERE booking.status = 'no_show')::integer AS booking_no_show_count,
        (SELECT COUNT(*)::integer FROM public.student_weekly_attendance swa
          WHERE swa.student_id = student.id AND swa.week_start = v_week_start
            AND swa.status = 'no_show') AS weekly_no_show_count,
        COUNT(*) FILTER (WHERE booking.status IN ('attended', 'no_show'))::integer
          + (SELECT COUNT(*)::integer FROM public.student_weekly_attendance swa
            WHERE swa.student_id = student.id AND swa.week_start = v_week_start
              AND swa.status = 'no_show') AS completed_count,
        COUNT(*) FILTER (
          WHERE cancellation.review_status = 'pending'
             OR cancellation.resolution = 'justified'
        )::integer AS pending_cancellations
      FROM public.bookings booking
      JOIN public.sessions session ON session.id = booking.session_id
      LEFT JOIN public.booking_cancellations cancellation ON cancellation.booking_id = booking.id
      WHERE booking.student_id = student.id
        AND (session.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_week_start AND p_sunday
    ) counts
    WHERE student.is_active = true
      AND COALESCE(student.operational_status, '') NOT IN
        ('inactive', 'paused', 'retired', 'withdrawn', 'blocked', 'suspended')
      -- operational_status, complete-week boundaries and freezes are checked before deficits.
  ), combined AS (
    SELECT * FROM cancellation_candidates
    UNION ALL
    SELECT * FROM quota_candidates WHERE missing_count > 0
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(combined) ORDER BY student_name, candidate_type), '[]'::jsonb)
  INTO v_candidates FROM combined;

  RETURN jsonb_build_object(
    'is_sunday', true, 'week_start', v_week_start, 'week_end', p_sunday,
    'pending_count', v_pending_count, 'candidates', v_candidates
  );
END;
$$;

GRANT SELECT ON public.academy_locations,
  public.weekly_template_equipment_allocations, public.session_equipment_allocations,
  public.membership_purchases, public.membership_fixed_schedules,
  public.membership_recovery_credits, public.membership_freezes,
  public.membership_time_adjustments, public.booking_cancellations,
  public.booking_resource_claims TO authenticated;
GRANT SELECT ON public.academy_bows TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.academy_locations, public.academy_bows,
  public.weekly_template_equipment_allocations, public.session_equipment_allocations,
  public.membership_purchases, public.membership_fixed_schedules,
  public.membership_recovery_credits, public.membership_freezes,
  public.membership_time_adjustments TO authenticated;

REVOKE ALL ON FUNCTION public.get_multisite_session_availability(uuid, uuid, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_booking_resources(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_booking_resources(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.book_session_multisite(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_student_cancellation(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_membership_freeze(uuid, date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finish_membership_freeze(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_generate_fixed_bookings(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_student_week_overview(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_weekly_attendance_review(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_student_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, date, uuid, uuid[], integer, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_multisite_session_availability(uuid, uuid, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_session_multisite(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_week_overview(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_attendance_review(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_student_cancellation(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_membership_freeze(uuid, date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finish_membership_freeze(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_generate_fixed_bookings(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_student_membership_cycles(uuid, uuid, date, integer, text, integer, date, numeric, numeric, text, text, numeric, text, date, uuid, uuid[], integer, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_booking_resource_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'reserved'
    AND (NEW.status <> 'reserved' OR NEW.session_id IS DISTINCT FROM OLD.session_id)
  THEN
    PERFORM public.release_booking_resources(OLD.id, COALESCE(NEW.status::text, 'session_changed'));
  END IF;

  IF NEW.status = 'reserved'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status <> 'reserved'
      OR NEW.session_id IS DISTINCT FROM OLD.session_id
    )
  THEN
    PERFORM public.claim_booking_resources(NEW.id, NEW.intro_client_id IS NOT NULL);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_overlapping_student_bookings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session public.sessions;
BEGIN
  IF NEW.status <> 'reserved' OR NEW.student_id IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.students WHERE id = NEW.student_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions WHERE id = NEW.session_id;
  IF EXISTS (
    SELECT 1
    FROM public.bookings existing_booking
    JOIN public.sessions existing_session ON existing_session.id = existing_booking.session_id
    WHERE existing_booking.student_id = NEW.student_id
      AND existing_booking.status = 'reserved'
      AND existing_booking.id <> NEW.id
      AND existing_session.start_at < v_session.end_at
      AND existing_session.end_at > v_session.start_at
  ) THEN
    RAISE EXCEPTION 'El alumno ya tiene otra reserva en un horario superpuesto';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_prevent_student_overlap ON public.bookings;
CREATE TRIGGER bookings_prevent_student_overlap
  BEFORE INSERT OR UPDATE OF session_id, student_id, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_student_bookings();

DROP TRIGGER IF EXISTS bookings_sync_resource_claims ON public.bookings;
CREATE TRIGGER bookings_sync_resource_claims
  AFTER INSERT OR UPDATE OF session_id, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_resource_claims();

-- Existing active reservations must consume the new physical resources from
-- the moment the migration is enabled; otherwise the first new booking could
-- over-allocate a bow that is already in use.
DO $$
DECLARE
  existing_booking record;
BEGIN
  FOR existing_booking IN
    SELECT booking.id, booking.intro_client_id
    FROM public.bookings booking
    JOIN public.sessions session ON session.id = booking.session_id
    WHERE booking.status = 'reserved'
    ORDER BY session.start_at, booking.created_at, booking.id
  LOOP
    PERFORM public.claim_booking_resources(
      existing_booking.id,
      existing_booking.intro_client_id IS NOT NULL
    );
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.get_available_intro_sessions(date, date);
CREATE FUNCTION public.get_available_intro_sessions(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  equipment_capacity integer,
  equipment_reserved integer,
  spots_remaining integer,
  location_code text,
  location_name text,
  location_address text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar turnos de prueba';
  END IF;
  RETURN QUERY
  SELECT
    session.id,
    session.start_at,
    session.end_at,
    (availability.data->>'physical_capacity')::integer,
    ((availability.data->>'physical_capacity')::integer
      - (availability.data->>'physical_spots_remaining')::integer)::integer,
    LEAST(
      (availability.data->>'physical_spots_remaining')::integer,
      (availability.data->>'shared_bows_remaining')::integer
    )::integer,
    location.code,
    location.name,
    location.address
  FROM public.sessions session
  JOIN public.academy_locations location ON location.id = session.location_id
  CROSS JOIN LATERAL (
    SELECT public.get_multisite_session_availability(session.id, NULL, true, NULL) AS data
  ) availability
  WHERE session.status = 'scheduled'
    AND session.start_at > now()
    AND location.is_active = true
    AND (location.opens_on IS NULL OR (session.start_at AT TIME ZONE location.timezone)::date >= location.opens_on)
    AND (session.start_at AT TIME ZONE location.timezone)::date BETWEEN p_date_from AND p_date_to
    AND COALESCE((availability.data->>'available')::boolean, false)
  ORDER BY session.start_at, location.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_intro_sessions(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_intro_sessions(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cancel_session(
  p_session uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking record;
  v_cancelled integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden cancelar sesiones';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  PERFORM 1 FROM public.sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesion no encontrada'; END IF;

  FOR v_booking IN
    SELECT * FROM public.bookings
    WHERE session_id = p_session AND status = 'reserved'
    FOR UPDATE
  LOOP
    INSERT INTO public.booking_cancellations (
      booking_id, student_id, cancellation_source, review_status,
      admin_reason, cancelled_by
    ) VALUES (
      v_booking.id, v_booking.student_id, 'academy', 'not_required',
      btrim(p_reason), v_actor_id
    ) ON CONFLICT (booking_id) DO NOTHING;
    UPDATE public.bookings SET status = 'cancelled', cancelled_at = now(),
      cancelled_by_profile_id = v_actor_id, cancelled_by_role = 'admin', updated_at = now()
    WHERE id = v_booking.id;
    PERFORM public.release_booking_resources(v_booking.id, 'academy');
    v_cancelled := v_cancelled + 1;
  END LOOP;
  UPDATE public.sessions SET status = 'cancelled', notes = concat_ws(E'\n', notes, 'Cancelada: ' || btrim(p_reason)), updated_at = now()
  WHERE id = p_session;
  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_session(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id uuid,
  p_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_result json;
  v_recovery_balance integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden cancelar reservas';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  IF v_booking.credit_kind = 'recovery' AND EXISTS (
    SELECT 1 FROM public.student_credit_ledger ledger
    WHERE ledger.booking_id = p_booking_id AND ledger.movement_type = 'recovery_consumed'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.student_credit_ledger ledger
    WHERE ledger.booking_id = p_booking_id AND ledger.movement_type = 'booking_cancelled_refund'
  ) THEN
    UPDATE public.membership_recovery_credits
    SET classes_remaining = LEAST(classes_remaining + 1, classes_granted), updated_at = now()
    WHERE id = v_booking.recovery_credit_id
    RETURNING classes_remaining INTO v_recovery_balance;
    INSERT INTO public.student_credit_ledger (
      student_id, student_membership_id, booking_id, movement_type,
      delta, balance_after, reason, performed_by_profile_id
    ) VALUES (
      v_booking.student_id, v_booking.active_membership_id, p_booking_id,
      'booking_cancelled_refund', 1, v_recovery_balance,
      'Cancelación de academia; recuperación restaurada', v_actor_id
    );
    UPDATE public.bookings SET status = 'cancelled', cancelled_at = now(),
      cancelled_by_profile_id = v_actor_id, cancelled_by_role = 'admin', updated_at = now()
    WHERE id = p_booking_id;
    v_result := json_build_object('success', true, 'booking_id', p_booking_id, 'refunded', true);
  ELSE
    SELECT public.admin_cancel_booking(p_booking_id, true) INTO v_result;
  END IF;
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION '%', COALESCE(v_result->>'error', 'No se pudo cancelar la reserva');
  END IF;

  INSERT INTO public.booking_cancellations (
    booking_id, student_id, cancellation_source, review_status,
    admin_reason, cancelled_by
  ) VALUES (
    p_booking_id, v_booking.student_id, 'academy', 'not_required',
    btrim(p_reason), v_actor_id
  ) ON CONFLICT (booking_id) DO NOTHING;
  PERFORM public.release_booking_resources(p_booking_id, 'academy');
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid, text) TO authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_booking_consumption_once
  ON public.student_credit_ledger(booking_id)
  WHERE booking_id IS NOT NULL
    AND movement_type IN ('attendance_consumed', 'recovery_consumed');

CREATE OR REPLACE FUNCTION public.admin_mark_attendance(
  p_booking_id uuid,
  p_attended boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking public.bookings;
  v_new_status public.booking_status;
  v_balance integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar asistencia';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF v_booking.status = 'cancelled' THEN RAISE EXCEPTION 'No se puede marcar una reserva cancelada'; END IF;
  v_new_status := CASE WHEN p_attended THEN 'attended'::public.booking_status ELSE 'no_show'::public.booking_status END;
  IF v_booking.status IN ('attended', 'no_show') THEN
    RETURN json_build_object('success', true, 'booking_id', p_booking_id,
      'previous_status', v_booking.status, 'new_status', v_booking.status,
      'message', 'Asistencia ya registrada');
  END IF;
  IF v_booking.status <> 'reserved' THEN RAISE EXCEPTION 'Estado de reserva invalido'; END IF;

  IF v_booking.active_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_credit_ledger ledger
    WHERE ledger.booking_id = p_booking_id
      AND ledger.movement_type IN ('attendance_consumed', 'recovery_consumed')
  ) THEN
    IF v_booking.credit_kind = 'recovery' THEN
      UPDATE public.membership_recovery_credits
      SET classes_remaining = classes_remaining - 1, updated_at = now()
      WHERE id = v_booking.recovery_credit_id AND classes_remaining > 0
      RETURNING classes_remaining INTO v_balance;
      IF v_balance IS NULL THEN RAISE EXCEPTION 'La recuperación comprometida ya no está disponible'; END IF;
    ELSE
      UPDATE public.student_memberships
      SET classes_used = classes_used + 1,
          classes_remaining = classes_remaining - 1,
          updated_at = now()
      WHERE id = v_booking.active_membership_id AND classes_remaining > 0
      RETURNING classes_remaining INTO v_balance;
      IF v_balance IS NULL THEN RAISE EXCEPTION 'La membresía no tiene saldo disponible'; END IF;
    END IF;

    INSERT INTO public.student_credit_ledger (
      student_id, student_membership_id, booking_id, movement_type,
      delta, balance_after, reason, performed_by_profile_id
    ) VALUES (
      v_booking.student_id, v_booking.active_membership_id, v_booking.id,
      CASE WHEN v_booking.credit_kind = 'recovery' THEN 'recovery_consumed' ELSE 'attendance_consumed' END,
      -1, v_balance,
      CASE
        WHEN v_booking.credit_kind = 'recovery' AND p_attended THEN 'Recuperación consumida por asistencia'
        WHEN v_booking.credit_kind = 'recovery' THEN 'Recuperación consumida por inasistencia'
        WHEN p_attended THEN 'Clase normal consumida por asistencia'
        ELSE 'Clase normal consumida por inasistencia'
      END,
      v_actor_id
    );
  END IF;

  UPDATE public.bookings SET status = v_new_status,
    attendance_marked_by = v_actor_id, attendance_marked_at = now(), updated_at = now()
  WHERE id = p_booking_id;
  IF v_booking.student_id IS NOT NULL THEN
    PERFORM public.sync_student_membership_operational_status(v_booking.student_id);
  END IF;
  RETURN json_build_object('success', true, 'booking_id', p_booking_id,
    'previous_status', v_booking.status, 'new_status', v_new_status,
    'message', CASE WHEN p_attended THEN 'Asistencia marcada correctamente' ELSE 'Marcado como no asistió' END);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_attendance(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_attendance(uuid, boolean) TO authenticated, service_role;

-- Recovery credits keep their receiving cycle and the student's account active
-- until the cycle expires or both normal and recovery balances are exhausted.
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
  SET status = 'expired',
      expired_at = COALESCE(expired_at, public.membership_end_date_expired_at(end_date)),
      expiration_reason = COALESCE(expiration_reason, 'end_date'),
      classes_remaining = GREATEST(COALESCE(classes_remaining, 0), 0), updated_at = now()
  WHERE (p_student_id IS NULL OR student_id = p_student_id)
    AND status = 'active' AND end_date IS NOT NULL AND end_date < v_today;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  UPDATE public.student_memberships membership
  SET status = 'expired', expired_at = COALESCE(expired_at, now()),
      expiration_reason = COALESCE(expiration_reason, 'no_classes_remaining'),
      classes_remaining = 0, updated_at = now()
  WHERE (p_student_id IS NULL OR membership.student_id = p_student_id)
    AND membership.status = 'active'
    AND membership.classes_remaining <= 0
    AND NOT EXISTS (
      SELECT 1 FROM public.membership_recovery_credits recovery
      WHERE recovery.student_membership_id = membership.id
        AND recovery.classes_remaining > 0
    );
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_total_changed := v_total_changed + v_row_count;

  WITH target_students AS (
    SELECT student.id, student.is_active, student.operational_status
    FROM public.students student
    WHERE p_student_id IS NULL OR student.id = p_student_id
  ), computed AS (
    SELECT target.id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.student_memberships membership
          WHERE membership.student_id = target.id AND membership.status = 'active'
            AND membership.start_date <= v_today
            AND (membership.end_date IS NULL OR membership.end_date >= v_today)
            AND (
              COALESCE(membership.classes_remaining, 0) > 0
              OR EXISTS (SELECT 1 FROM public.membership_recovery_credits recovery
                WHERE recovery.student_membership_id = membership.id AND recovery.classes_remaining > 0)
            )
        ) THEN 'active'
        WHEN EXISTS (
          SELECT 1 FROM public.student_memberships membership
          WHERE membership.student_id = target.id AND membership.status = 'active'
            AND membership.start_date > v_today
            AND (
              COALESCE(membership.classes_remaining, 0) > 0
              OR EXISTS (SELECT 1 FROM public.membership_recovery_credits recovery
                WHERE recovery.student_membership_id = membership.id AND recovery.classes_remaining > 0)
            )
        ) THEN 'paused'
        WHEN latest_expired.id IS NOT NULL AND v_now_lima >= (
          COALESCE(latest_expired.expired_at,
            public.membership_end_date_expired_at(latest_expired.end_date),
            latest_expired.updated_at, latest_expired.created_at) AT TIME ZONE 'America/Lima'
        ) + interval '14 days' THEN 'paused'
        WHEN latest_expired.id IS NOT NULL THEN 'expired'
        WHEN EXISTS (SELECT 1 FROM public.student_memberships any_membership
          WHERE any_membership.student_id = target.id) THEN 'paused'
        WHEN COALESCE(target.is_active, false) THEN 'active'
        ELSE 'paused'
      END AS next_status
    FROM target_students target
    LEFT JOIN LATERAL (
      SELECT membership.* FROM public.student_memberships membership
      WHERE membership.student_id = target.id AND membership.status = 'expired'
      ORDER BY COALESCE(membership.expired_at,
        public.membership_end_date_expired_at(membership.end_date),
        membership.updated_at, membership.created_at) DESC,
        membership.created_at DESC, membership.id DESC
      LIMIT 1
    ) latest_expired ON true
  )
  UPDATE public.students student SET
    operational_status = computed.next_status,
    operational_status_reason = CASE computed.next_status
      WHEN 'active' THEN 'Membresia vigente con saldo normal o recuperacion disponible'
      WHEN 'expired' THEN 'Membresia expirada dentro del periodo de seguimiento'
      ELSE 'Sin membresia vigente con saldo disponible'
    END,
    operational_status_updated_at = now(), is_active = computed.next_status = 'active', updated_at = now()
  FROM computed
  WHERE student.id = computed.id
    AND NOT public.is_student_protected_operational_status(student.operational_status)
    AND (student.operational_status IS DISTINCT FROM computed.next_status
      OR student.is_active IS DISTINCT FROM (computed.next_status = 'active'));
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_total_changed + v_row_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_dashboard(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid, full_name text, avatar_url text, date_of_birth date, age integer,
  current_distance_m integer, category text, level text, student_is_active boolean,
  membership_name text, membership_start date, membership_end date,
  membership_status text, classes_total integer, classes_used integer, classes_remaining integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_today date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);
  PERFORM public.sync_student_membership_operational_status(v_student_id);
  RETURN QUERY
  SELECT student.id, student.full_name, student.avatar_url, student.date_of_birth,
    CASE WHEN student.date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM age(v_today, student.date_of_birth))::integer END,
    student.current_distance_m, student.category, student.level,
    (COALESCE(student.is_active, true)
      AND COALESCE(student.operational_status, 'active') = 'active'
      AND COALESCE(current_membership.available_classes, 0) > 0),
    COALESCE(current_membership.custom_name, fallback.custom_name),
    COALESCE(current_membership.start_date, fallback.start_date),
    COALESCE(current_membership.end_date, fallback.end_date),
    CASE
      WHEN current_membership.id IS NOT NULL AND current_membership.available_classes > 0 THEN 'active'
      WHEN current_membership.id IS NOT NULL THEN 'no_classes'
      WHEN fallback.status = 'active' AND fallback.start_date > v_today THEN 'scheduled'
      WHEN fallback.id IS NOT NULL THEN fallback.display_status
      ELSE 'no_membership'
    END,
    COALESCE(current_membership.classes_total, fallback.classes_total),
    COALESCE(current_membership.classes_used, fallback.classes_used),
    COALESCE(current_membership.available_classes, 0)::integer
  FROM public.students student
  LEFT JOIN LATERAL (
    SELECT membership.id, membership.custom_name, membership.start_date, membership.end_date,
      membership.classes_total + recovery.granted AS classes_total,
      membership.classes_used + recovery.used AS classes_used,
      GREATEST(COALESCE(membership.classes_remaining, 0) - commitments.normal_reserved, 0)
        + GREATEST(recovery.remaining - commitments.recovery_reserved, 0) AS available_classes
    FROM public.student_memberships membership
    CROSS JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE booking.credit_kind = 'normal')::integer AS normal_reserved,
        COUNT(*) FILTER (WHERE booking.credit_kind = 'recovery')::integer AS recovery_reserved
      FROM public.bookings booking
      WHERE booking.active_membership_id = membership.id AND booking.status = 'reserved'
    ) commitments
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(credit.classes_granted), 0)::integer AS granted,
        COALESCE(SUM(credit.classes_remaining), 0)::integer AS remaining,
        COALESCE(SUM(credit.classes_granted - credit.classes_remaining), 0)::integer AS used
      FROM public.membership_recovery_credits credit
      WHERE credit.student_membership_id = membership.id
    ) recovery
    WHERE membership.student_id = student.id AND membership.status = 'active'
      AND membership.start_date <= v_today
      AND (membership.end_date IS NULL OR membership.end_date >= v_today)
    ORDER BY membership.start_date, membership.created_at, membership.id
    LIMIT 1
  ) current_membership ON true
  LEFT JOIN LATERAL (
    SELECT membership.id, membership.status, membership.custom_name, membership.start_date,
      membership.end_date, membership.classes_total, membership.classes_used,
      CASE WHEN membership.status = 'active' AND membership.start_date > v_today
        THEN 'scheduled' ELSE 'expired' END::text AS display_status
    FROM public.student_memberships membership
    WHERE membership.student_id = student.id
      AND ((membership.status = 'active' AND membership.start_date > v_today)
        OR membership.status IN ('expired', 'historical'))
    ORDER BY CASE WHEN membership.status = 'active' AND membership.start_date > v_today THEN 0 ELSE 1 END,
      CASE WHEN membership.status = 'active' AND membership.start_date > v_today THEN membership.start_date END,
      membership.created_at DESC, membership.id DESC
    LIMIT 1
  ) fallback ON current_membership.id IS NULL
  WHERE student.id = v_student_id;
END;
$$;

COMMIT;
