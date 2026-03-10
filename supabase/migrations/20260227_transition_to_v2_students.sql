-- ============================================================================
-- TRANSITION TO V2 STUDENTS
-- Fecha: 2026-02-27
-- Proposito:
-- 1. Adaptar bookings al nuevo modelo
-- 2. Crear students desde profiles legacy
-- 3. Migrar profile_memberships a student_memberships
-- 4. Sembrar payments y ledger inicial
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BOOKINGS: columnas V2 sin romper user_id legacy
-- ----------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booked_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_membership_id uuid REFERENCES public.student_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_bookings_student_id
  ON public.bookings(student_id);

CREATE INDEX IF NOT EXISTS idx_bookings_booked_by_profile_id
  ON public.bookings(booked_by_profile_id);

-- ----------------------------------------------------------------------------
-- LEGACY BOOKINGS POLICIES: sumar acceso por student_id
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "User can see own bookings via student" ON public.bookings;
CREATE POLICY "User can see own bookings via student"
  ON public.bookings
  FOR SELECT
  USING (
    student_id IS NOT NULL
    AND public.can_access_student(student_id)
  );

DROP POLICY IF EXISTS "User can cancel own booking via student" ON public.bookings;
CREATE POLICY "User can cancel own booking via student"
  ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    student_id IS NOT NULL
    AND public.can_access_student(student_id)
  )
  WITH CHECK (
    student_id IS NOT NULL
    AND public.can_access_student(student_id)
  );

-- ----------------------------------------------------------------------------
-- BACKFILL: students desde profiles legacy
-- Regla de transicion:
-- cada profile con role=student genera un student y queda self-linked
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_has_avatar boolean;
  v_has_birth_date boolean;
  v_has_date_of_birth boolean;
  v_has_phone boolean;
  v_has_email boolean;
  v_has_dni boolean;
  v_has_distance boolean;
  v_has_group boolean;
  v_has_level boolean;
  v_has_has_own_bow boolean;
  v_has_assigned_bow boolean;
  v_has_bow_poundage boolean;
  v_has_medical_notes boolean;
  v_has_is_active boolean;
  v_has_created_at boolean;
  v_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) INTO v_has_avatar;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'birth_date'
  ) INTO v_has_birth_date;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'date_of_birth'
  ) INTO v_has_date_of_birth;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone'
  ) INTO v_has_phone;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) INTO v_has_email;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'dni'
  ) INTO v_has_dni;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'distance_m'
  ) INTO v_has_distance;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'group_type'
  ) INTO v_has_group;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'level'
  ) INTO v_has_level;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'has_own_bow'
  ) INTO v_has_has_own_bow;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'assigned_bow'
  ) INTO v_has_assigned_bow;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'bow_poundage'
  ) INTO v_has_bow_poundage;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'medical_notes'
  ) INTO v_has_medical_notes;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active'
  ) INTO v_has_is_active;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at'
  ) INTO v_has_created_at;

  v_sql := '
    INSERT INTO public.students (
      full_name,
      avatar_url,
      date_of_birth,
      dni,
      phone,
      email,
      medical_notes,
      current_distance_m,
      category,
      level,
      has_own_bow,
      assigned_bow,
      bow_poundage,
      is_active,
      self_profile_id,
      created_by,
      created_at,
      updated_at
    )
    SELECT
      COALESCE(p.full_name, ''Alumno migrado'') AS full_name,
      ' || CASE WHEN v_has_avatar THEN 'p.avatar_url' ELSE 'NULL::text' END || ' AS avatar_url,
      ' || CASE
        WHEN v_has_date_of_birth THEN 'p.date_of_birth'
        WHEN v_has_birth_date THEN 'p.birth_date'
        ELSE 'NULL::date'
      END || ' AS date_of_birth,
      ' || CASE WHEN v_has_dni THEN 'p.dni' ELSE 'NULL::char(8)' END || ' AS dni,
      ' || CASE WHEN v_has_phone THEN 'p.phone' ELSE 'NULL::text' END || ' AS phone,
      ' || CASE WHEN v_has_email THEN 'p.email' ELSE 'NULL::text' END || ' AS email,
      ' || CASE WHEN v_has_medical_notes THEN 'p.medical_notes' ELSE 'NULL::text' END || ' AS medical_notes,
      ' || CASE WHEN v_has_distance THEN 'p.distance_m' ELSE 'NULL::integer' END || ' AS current_distance_m,
      ' || CASE WHEN v_has_group THEN 'p.group_type' ELSE 'NULL::text' END || ' AS category,
      ' || CASE WHEN v_has_level THEN 'p.level' ELSE 'NULL::text' END || ' AS level,
      ' || CASE WHEN v_has_has_own_bow THEN 'COALESCE(p.has_own_bow, false)' ELSE 'false' END || ' AS has_own_bow,
      ' || CASE WHEN v_has_assigned_bow THEN 'COALESCE(p.assigned_bow, false)' ELSE 'false' END || ' AS assigned_bow,
      ' || CASE WHEN v_has_bow_poundage THEN 'p.bow_poundage' ELSE 'NULL::integer' END || ' AS bow_poundage,
      ' || CASE WHEN v_has_is_active THEN 'COALESCE(p.is_active, true)' ELSE 'true' END || ' AS is_active,
      p.id AS self_profile_id,
      (
        SELECT p_admin.id
        FROM public.profiles p_admin
        WHERE p_admin.role = ''admin''
        ORDER BY ' || CASE WHEN v_has_created_at THEN 'p_admin.created_at' ELSE 'p_admin.id' END || ' ASC
        LIMIT 1
      ) AS created_by,
      ' || CASE WHEN v_has_created_at THEN 'COALESCE(p.created_at, now())' ELSE 'now()' END || ' AS created_at,
      now() AS updated_at
    FROM public.profiles p
    WHERE p.role = ''student''
      AND NOT EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.self_profile_id = p.id
      )
  ';

  EXECUTE v_sql;
END
$$;

-- ----------------------------------------------------------------------------
-- BACKFILL: memberships legacy -> membership_plans
-- Se preserva el mismo UUID para mantener compatibilidad con profile_memberships.membership_id
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_has_default_classes boolean;
  v_has_is_active boolean;
  v_has_created_at boolean;
  v_has_updated_at boolean;
  v_sql text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'memberships'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'default_classes'
    ) INTO v_has_default_classes;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'is_active'
    ) INTO v_has_is_active;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'created_at'
    ) INTO v_has_created_at;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'updated_at'
    ) INTO v_has_updated_at;

    v_sql := '
      INSERT INTO public.membership_plans (
        id,
        name,
        description,
        classes_included,
        duration_days,
        base_price,
        currency,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        m.id,
        COALESCE(m.name, ''Plan migrado'') AS name,
        ''Migrado desde memberships'' AS description,
        ' || CASE WHEN v_has_default_classes THEN 'COALESCE(m.default_classes, 0)' ELSE '0' END || ' AS classes_included,
        NULL::integer AS duration_days,
        NULL::numeric(10,2) AS base_price,
        ''PEN'' AS currency,
        ' || CASE WHEN v_has_is_active THEN 'COALESCE(m.is_active, true)' ELSE 'true' END || ' AS is_active,
        ' || CASE WHEN v_has_created_at THEN 'COALESCE(m.created_at, now())' ELSE 'now()' END || ' AS created_at,
        ' || CASE WHEN v_has_updated_at THEN 'COALESCE(m.updated_at, now())' ELSE 'now()' END || ' AS updated_at
      FROM public.memberships m
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.membership_plans mp
        WHERE mp.id = m.id
      )
    ';

    EXECUTE v_sql;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- BACKFILL: memberships legacy -> student_memberships
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'profile_memberships'
  ) THEN
    INSERT INTO public.student_memberships (
      student_id,
      legacy_profile_membership_id,
      membership_plan_id,
      custom_name,
      classes_total,
      classes_used,
      classes_remaining,
      start_date,
      end_date,
      status,
      total_amount,
      currency,
      sold_by_profile_id,
      created_at,
      updated_at
    )
    SELECT
      s.id AS student_id,
      pm.id AS legacy_profile_membership_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.membership_plans mp
          WHERE mp.id = pm.membership_id
        ) THEN pm.membership_id
        ELSE NULL
      END AS membership_plan_id,
      COALESCE(pm.name, 'Membresia migrada') AS custom_name,
      COALESCE(pm.classes_total, 0) AS classes_total,
      COALESCE(pm.classes_used, 0) AS classes_used,
      GREATEST(COALESCE(pm.classes_total, 0) - COALESCE(pm.classes_used, 0), 0) AS classes_remaining,
      pm.start_date::date AS start_date,
      pm.end_date::date AS end_date,
      CASE
        WHEN pm.status IN ('draft', 'active', 'expired', 'cancelled', 'consumed', 'historical') THEN pm.status
        WHEN pm.status = 'inactive' THEN 'historical'
        ELSE 'historical'
      END AS status,
      COALESCE(pm.amount_paid, 0) AS total_amount,
      'PEN' AS currency,
      (
        SELECT p_admin.id
        FROM public.profiles p_admin
        WHERE p_admin.role = 'admin'
        ORDER BY p_admin.created_at ASC NULLS LAST
        LIMIT 1
      ) AS sold_by_profile_id,
      now() AS created_at,
      now() AS updated_at
    FROM public.profile_memberships pm
    INNER JOIN public.students s
      ON s.self_profile_id = pm.profile_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.student_memberships sm
      WHERE sm.legacy_profile_membership_id = pm.id
    );
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- BACKFILL: payments desde amount_paid historico
-- Se usa start_date como fecha referencial de pago de migracion
-- ----------------------------------------------------------------------------

INSERT INTO public.student_membership_payments (
  student_id,
  student_membership_id,
  due_date,
  paid_at,
  amount,
  currency,
  payment_method,
  payment_status,
  reward_credits,
  reward_reason,
  notes,
  source,
  recorded_by_profile_id,
  created_at
)
SELECT
  sm.student_id,
  sm.id AS student_membership_id,
  sm.start_date AS due_date,
  sm.start_date::timestamp AT TIME ZONE 'America/Lima' AS paid_at,
  sm.total_amount AS amount,
  sm.currency,
  'migration' AS payment_method,
  CASE WHEN sm.total_amount > 0 THEN 'paid' ELSE 'waived' END AS payment_status,
  0 AS reward_credits,
  NULL::text AS reward_reason,
  'Pago migrado desde profile_memberships.amount_paid' AS notes,
  'migration' AS source,
  sm.sold_by_profile_id AS recorded_by_profile_id,
  now() AS created_at
FROM public.student_memberships sm
WHERE sm.legacy_profile_membership_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_membership_payments pay
    WHERE pay.student_membership_id = sm.id
      AND pay.source = 'migration'
  );

-- ----------------------------------------------------------------------------
-- BACKFILL: ledger inicial
-- ----------------------------------------------------------------------------

INSERT INTO public.student_credit_ledger (
  student_id,
  student_membership_id,
  movement_type,
  delta,
  balance_after,
  reason,
  performed_by_profile_id,
  created_at
)
SELECT
  sm.student_id,
  sm.id,
  'migration_seed' AS movement_type,
  sm.classes_total AS delta,
  sm.classes_total AS balance_after,
  'Saldo inicial migrado desde profile_memberships' AS reason,
  sm.sold_by_profile_id AS performed_by_profile_id,
  now() AS created_at
FROM public.student_memberships sm
WHERE NOT EXISTS (
  SELECT 1
  FROM public.student_credit_ledger l
  WHERE l.student_membership_id = sm.id
    AND l.movement_type = 'migration_seed'
);

INSERT INTO public.student_credit_ledger (
  student_id,
  student_membership_id,
  movement_type,
  delta,
  balance_after,
  reason,
  performed_by_profile_id,
  created_at
)
SELECT
  sm.student_id,
  sm.id,
  'migration_usage' AS movement_type,
  sm.classes_used * -1 AS delta,
  sm.classes_remaining AS balance_after,
  'Consumo historico migrado desde profile_memberships' AS reason,
  sm.sold_by_profile_id AS performed_by_profile_id,
  now() AS created_at
FROM public.student_memberships sm
WHERE sm.classes_used > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_credit_ledger l
    WHERE l.student_membership_id = sm.id
      AND l.movement_type = 'migration_usage'
  );

-- ----------------------------------------------------------------------------
-- BACKFILL: bookings -> student_id
-- En transicion, las reservas legacy se asumen creadas por el mismo profile
-- ----------------------------------------------------------------------------

UPDATE public.bookings b
SET
  student_id = s.id,
  booked_by_profile_id = COALESCE(b.booked_by_profile_id, b.user_id),
  updated_at = now()
FROM public.students s
WHERE b.student_id IS NULL
  AND s.self_profile_id = b.user_id;

UPDATE public.bookings b
SET active_membership_id = (
  SELECT sm_inner.id
  FROM public.student_memberships sm_inner
  INNER JOIN public.sessions sess
    ON sess.id = b.session_id
  WHERE sm_inner.student_id = b.student_id
    AND sm_inner.start_date <= (sess.start_at AT TIME ZONE 'America/Lima')::date
    AND (
      sm_inner.end_date IS NULL
      OR sm_inner.end_date >= (sess.start_at AT TIME ZONE 'America/Lima')::date
    )
  ORDER BY sm_inner.start_date DESC, sm_inner.created_at DESC
  LIMIT 1
)
WHERE b.student_id IS NOT NULL
  AND b.active_membership_id IS NULL;

COMMENT ON COLUMN public.bookings.student_id IS
  'Alumno reservado en V2. user_id se mantiene temporalmente por compatibilidad legacy.';
