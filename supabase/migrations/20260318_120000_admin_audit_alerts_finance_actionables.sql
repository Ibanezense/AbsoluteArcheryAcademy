-- ============================================================================
-- ADMIN AUDIT + ALERT AUTOMATION + FINANCE ACTIONABLE DASHBOARD
-- Fecha: 2026-03-18
-- Proposito:
-- 1. Auditar acciones criticas de admin
-- 2. Generar cola automatica de alertas (recordatorios, vencimientos, morosidad)
-- 3. Exponer dashboard financiero accionable
-- ============================================================================

-- --------------------------------------------------------------------------
-- AUDITORIA ADMIN
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_audit_created_at
  ON public.admin_action_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_audit_action_type
  ON public.admin_action_audit(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_audit_student
  ON public.admin_action_audit(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_audit_session
  ON public.admin_action_audit(session_id, created_at DESC);

ALTER TABLE public.admin_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_action_audit_select_admin ON public.admin_action_audit;
CREATE POLICY admin_action_audit_select_admin
  ON public.admin_action_audit
  FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS admin_action_audit_insert_admin ON public.admin_action_audit;
CREATE POLICY admin_action_audit_insert_admin
  ON public.admin_action_audit
  FOR INSERT
  WITH CHECK (public.is_admin_user());

DROP FUNCTION IF EXISTS public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type text,
  p_target_table text,
  p_target_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_role text;
BEGIN
  v_actor_id := auth.uid();
  v_role := COALESCE(auth.role(), '');

  IF v_actor_id IS NULL AND v_role <> 'service_role' THEN
    RETURN;
  END IF;

  IF v_actor_id IS NOT NULL AND NOT public.is_admin_user() THEN
    RETURN;
  END IF;

  INSERT INTO public.admin_action_audit (
    actor_profile_id,
    action_type,
    target_table,
    target_id,
    student_id,
    session_id,
    booking_id,
    metadata,
    created_at
  )
  VALUES (
    v_actor_id,
    COALESCE(NULLIF(btrim(p_action_type), ''), 'admin_action'),
    COALESCE(NULLIF(btrim(p_target_table), ''), 'unknown'),
    p_target_id,
    p_student_id,
    p_session_id,
    p_booking_id,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.trg_audit_bookings();
CREATE OR REPLACE FUNCTION public.trg_audit_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'reserved' THEN
      PERFORM public.log_admin_action(
        'booking_reserved',
        'bookings',
        NEW.id,
        NEW.student_id,
        NEW.session_id,
        NEW.id,
        jsonb_build_object(
          'distance_m', NEW.distance_m,
          'group_type', NEW.group_type,
          'bow_usage_type', NEW.bow_usage_type,
          'bow_poundage', NEW.bow_poundage,
          'admin_notes', NEW.admin_notes
        )
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status = 'cancelled'
    THEN
      PERFORM public.log_admin_action(
        'booking_cancelled',
        'bookings',
        NEW.id,
        NEW.student_id,
        NEW.session_id,
        NEW.id,
        jsonb_build_object(
          'previous_status', OLD.status,
          'new_status', NEW.status,
          'cancelled_by_profile_id', NEW.cancelled_by_profile_id,
          'cancelled_at', NEW.cancelled_at
        )
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bookings ON public.bookings;
CREATE TRIGGER trg_audit_bookings
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_bookings();

DROP FUNCTION IF EXISTS public.trg_audit_sessions();
CREATE OR REPLACE FUNCTION public.trg_audit_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status = 'cancelled'
  THEN
    PERFORM public.log_admin_action(
      'session_cancelled',
      'sessions',
      NEW.id,
      NULL,
      NEW.id,
      NULL,
      jsonb_build_object(
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'start_at', NEW.start_at,
        'end_at', NEW.end_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_sessions ON public.sessions;
CREATE TRIGGER trg_audit_sessions
  AFTER UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_sessions();

DROP FUNCTION IF EXISTS public.trg_audit_student_memberships();
CREATE OR REPLACE FUNCTION public.trg_audit_student_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_admin_action(
      'membership_created',
      'student_memberships',
      NEW.id,
      NEW.student_id,
      NULL,
      NULL,
      jsonb_build_object(
        'status', NEW.status,
        'classes_total', NEW.classes_total,
        'classes_remaining', NEW.classes_remaining,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'total_amount', NEW.total_amount,
        'currency', NEW.currency
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF
      OLD.status IS DISTINCT FROM NEW.status
      OR OLD.classes_total IS DISTINCT FROM NEW.classes_total
      OR OLD.classes_used IS DISTINCT FROM NEW.classes_used
      OR OLD.classes_remaining IS DISTINCT FROM NEW.classes_remaining
      OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
      OR OLD.start_date IS DISTINCT FROM NEW.start_date
      OR OLD.end_date IS DISTINCT FROM NEW.end_date
      OR OLD.custom_name IS DISTINCT FROM NEW.custom_name
    THEN
      PERFORM public.log_admin_action(
        'membership_updated',
        'student_memberships',
        NEW.id,
        NEW.student_id,
        NULL,
        NULL,
        jsonb_build_object(
          'previous_status', OLD.status,
          'new_status', NEW.status,
          'classes_total', NEW.classes_total,
          'classes_used', NEW.classes_used,
          'classes_remaining', NEW.classes_remaining,
          'total_amount', NEW.total_amount,
          'start_date', NEW.start_date,
          'end_date', NEW.end_date
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_admin_action(
      'membership_deleted',
      'student_memberships',
      OLD.id,
      OLD.student_id,
      NULL,
      NULL,
      jsonb_build_object(
        'status', OLD.status,
        'classes_total', OLD.classes_total,
        'classes_used', OLD.classes_used,
        'classes_remaining', OLD.classes_remaining,
        'total_amount', OLD.total_amount
      )
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_student_memberships ON public.student_memberships;
CREATE TRIGGER trg_audit_student_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.student_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_student_memberships();

DROP FUNCTION IF EXISTS public.trg_audit_students();
CREATE OR REPLACE FUNCTION public.trg_audit_students()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.is_active IS DISTINCT FROM NEW.is_active
  THEN
    PERFORM public.log_admin_action(
      'student_status_changed',
      'students',
      NEW.id,
      NEW.id,
      NULL,
      NULL,
      jsonb_build_object(
        'previous_is_active', OLD.is_active,
        'new_is_active', NEW.is_active,
        'full_name', NEW.full_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_students ON public.students;
CREATE TRIGGER trg_audit_students
  AFTER UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_students();

-- --------------------------------------------------------------------------
-- COLA DE ALERTAS AUTOMATICAS
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_alert_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN (
    'session_reminder_24h',
    'session_reminder_2h',
    'membership_expiry',
    'low_classes',
    'payment_overdue'
  )),
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('email', 'whatsapp', 'in_app')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  membership_id uuid REFERENCES public.student_memberships(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.student_membership_payments(id) ON DELETE SET NULL,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  title text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_alert_queue_alert_key_unique UNIQUE (alert_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_alert_queue_status_schedule
  ON public.admin_alert_queue(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_admin_alert_queue_student
  ON public.admin_alert_queue(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_alert_queue_type
  ON public.admin_alert_queue(alert_type, created_at DESC);

ALTER TABLE public.admin_alert_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_alert_queue_select_admin ON public.admin_alert_queue;
CREATE POLICY admin_alert_queue_select_admin
  ON public.admin_alert_queue
  FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS admin_alert_queue_update_admin ON public.admin_alert_queue;
CREATE POLICY admin_alert_queue_update_admin
  ON public.admin_alert_queue
  FOR UPDATE
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP FUNCTION IF EXISTS public.update_admin_alert_queue_updated_at();
CREATE OR REPLACE FUNCTION public.update_admin_alert_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_alert_queue_updated_at ON public.admin_alert_queue;
CREATE TRIGGER trg_admin_alert_queue_updated_at
  BEFORE UPDATE ON public.admin_alert_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_admin_alert_queue_updated_at();

DROP FUNCTION IF EXISTS public.admin_generate_alert_queue(timestamptz);
CREATE OR REPLACE FUNCTION public.admin_generate_alert_queue(
  p_reference timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference timestamptz := COALESCE(p_reference, now());
  v_reference_date date := (COALESCE(p_reference, now()) AT TIME ZONE 'America/Lima')::date;
  v_rows integer := 0;
  v_total integer := 0;
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Recordatorio 24 horas antes
  INSERT INTO public.admin_alert_queue (
    alert_key,
    alert_type,
    channel,
    priority,
    student_id,
    session_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    title,
    message,
    scheduled_for,
    payload,
    created_at,
    updated_at
  )
  SELECT
    format('session_reminder_24h:%s:%s', b.id, to_char(s.start_at AT TIME ZONE 'America/Lima', 'YYYYMMDDHH24MI')),
    'session_reminder_24h',
    CASE
      WHEN COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')) IS NOT NULL THEN 'email'
      WHEN COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')) IS NOT NULL THEN 'whatsapp'
      ELSE 'in_app'
    END,
    'normal',
    st.id,
    s.id,
    COALESCE(NULLIF(st.full_name, ''), 'Alumno'),
    COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')),
    COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')),
    'Recordatorio de clase (24h)',
    format('Tu clase es el %s.', to_char(s.start_at AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI')),
    v_reference,
    jsonb_build_object(
      'booking_id', b.id,
      'session_id', s.id,
      'session_start_at', s.start_at,
      'window', '24h'
    ),
    now(),
    now()
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  INNER JOIN public.students st ON st.id = b.student_id
  LEFT JOIN public.student_guardians sg ON sg.student_id = st.id
  LEFT JOIN public.profiles g ON g.id = sg.guardian_profile_id
  WHERE b.status = 'reserved'
    AND s.status = 'scheduled'
    AND s.start_at >= v_reference + INTERVAL '23 hours'
    AND s.start_at < v_reference + INTERVAL '25 hours'
  ON CONFLICT (alert_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  -- Recordatorio 2 horas antes
  INSERT INTO public.admin_alert_queue (
    alert_key,
    alert_type,
    channel,
    priority,
    student_id,
    session_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    title,
    message,
    scheduled_for,
    payload,
    created_at,
    updated_at
  )
  SELECT
    format('session_reminder_2h:%s:%s', b.id, to_char(s.start_at AT TIME ZONE 'America/Lima', 'YYYYMMDDHH24MI')),
    'session_reminder_2h',
    CASE
      WHEN COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')) IS NOT NULL THEN 'email'
      WHEN COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')) IS NOT NULL THEN 'whatsapp'
      ELSE 'in_app'
    END,
    'high',
    st.id,
    s.id,
    COALESCE(NULLIF(st.full_name, ''), 'Alumno'),
    COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')),
    COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')),
    'Recordatorio de clase (2h)',
    format('Tu clase inicia en 2 horas: %s.', to_char(s.start_at AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI')),
    v_reference,
    jsonb_build_object(
      'booking_id', b.id,
      'session_id', s.id,
      'session_start_at', s.start_at,
      'window', '2h'
    ),
    now(),
    now()
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  INNER JOIN public.students st ON st.id = b.student_id
  LEFT JOIN public.student_guardians sg ON sg.student_id = st.id
  LEFT JOIN public.profiles g ON g.id = sg.guardian_profile_id
  WHERE b.status = 'reserved'
    AND s.status = 'scheduled'
    AND s.start_at >= v_reference + INTERVAL '1 hour'
    AND s.start_at < v_reference + INTERVAL '3 hours'
  ON CONFLICT (alert_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  -- Membresias por vencer en los siguientes 7 dias
  INSERT INTO public.admin_alert_queue (
    alert_key,
    alert_type,
    channel,
    priority,
    student_id,
    membership_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    title,
    message,
    scheduled_for,
    payload,
    created_at,
    updated_at
  )
  SELECT
    format('membership_expiry:%s:%s', sm.id, to_char(sm.end_date, 'YYYYMMDD')),
    'membership_expiry',
    CASE
      WHEN COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')) IS NOT NULL THEN 'email'
      WHEN COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')) IS NOT NULL THEN 'whatsapp'
      ELSE 'in_app'
    END,
    'normal',
    st.id,
    sm.id,
    COALESCE(NULLIF(st.full_name, ''), 'Alumno'),
    COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')),
    COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')),
    'Membresia por vencer',
    format('Tu membresia vence el %s.', to_char(sm.end_date, 'DD/MM/YYYY')),
    v_reference,
    jsonb_build_object(
      'membership_id', sm.id,
      'end_date', sm.end_date,
      'classes_remaining', sm.classes_remaining
    ),
    now(),
    now()
  FROM public.student_memberships sm
  INNER JOIN public.students st ON st.id = sm.student_id
  LEFT JOIN public.student_guardians sg ON sg.student_id = st.id
  LEFT JOIN public.profiles g ON g.id = sg.guardian_profile_id
  WHERE sm.status = 'active'
    AND sm.end_date IS NOT NULL
    AND sm.end_date >= v_reference_date
    AND sm.end_date <= v_reference_date + 7
  ON CONFLICT (alert_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  -- Pocas clases restantes (0 a 2)
  INSERT INTO public.admin_alert_queue (
    alert_key,
    alert_type,
    channel,
    priority,
    student_id,
    membership_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    title,
    message,
    scheduled_for,
    payload,
    created_at,
    updated_at
  )
  SELECT
    format('low_classes:%s:%s:%s', sm.id, sm.classes_remaining, to_char(v_reference_date, 'YYYYMMDD')),
    'low_classes',
    CASE
      WHEN COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')) IS NOT NULL THEN 'email'
      WHEN COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')) IS NOT NULL THEN 'whatsapp'
      ELSE 'in_app'
    END,
    CASE WHEN sm.classes_remaining = 0 THEN 'high' ELSE 'normal' END,
    st.id,
    sm.id,
    COALESCE(NULLIF(st.full_name, ''), 'Alumno'),
    COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')),
    COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')),
    'Quedan pocas clases',
    format('Te quedan %s clases disponibles en tu membresia.', sm.classes_remaining),
    v_reference,
    jsonb_build_object(
      'membership_id', sm.id,
      'classes_remaining', sm.classes_remaining,
      'end_date', sm.end_date
    ),
    now(),
    now()
  FROM public.student_memberships sm
  INNER JOIN public.students st ON st.id = sm.student_id
  LEFT JOIN public.student_guardians sg ON sg.student_id = st.id
  LEFT JOIN public.profiles g ON g.id = sg.guardian_profile_id
  WHERE sm.status = 'active'
    AND sm.classes_remaining BETWEEN 0 AND 2
    AND (sm.end_date IS NULL OR sm.end_date >= v_reference_date)
  ON CONFLICT (alert_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  -- Pagos atrasados
  INSERT INTO public.admin_alert_queue (
    alert_key,
    alert_type,
    channel,
    priority,
    student_id,
    membership_id,
    payment_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    title,
    message,
    scheduled_for,
    payload,
    created_at,
    updated_at
  )
  SELECT
    format('payment_overdue:%s:%s', p.id, to_char(v_reference_date, 'YYYYMMDD')),
    'payment_overdue',
    CASE
      WHEN COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')) IS NOT NULL THEN 'email'
      WHEN COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')) IS NOT NULL THEN 'whatsapp'
      ELSE 'in_app'
    END,
    'high',
    st.id,
    p.student_membership_id,
    p.id,
    COALESCE(NULLIF(st.full_name, ''), 'Alumno'),
    COALESCE(NULLIF(st.email, ''), NULLIF(g.email, '')),
    COALESCE(NULLIF(st.phone, ''), NULLIF(g.phone, '')),
    'Pago atrasado',
    format('Tienes un pago pendiente con vencimiento %s por %s %s.', to_char(p.due_date, 'DD/MM/YYYY'), p.currency, p.amount),
    v_reference,
    jsonb_build_object(
      'payment_id', p.id,
      'due_date', p.due_date,
      'amount', p.amount,
      'currency', p.currency,
      'payment_status', p.payment_status
    ),
    now(),
    now()
  FROM public.student_membership_payments p
  INNER JOIN public.students st ON st.id = p.student_id
  LEFT JOIN public.student_guardians sg ON sg.student_id = st.id
  LEFT JOIN public.profiles g ON g.id = sg.guardian_profile_id
  WHERE p.payment_status IN ('pending', 'late')
    AND p.due_date IS NOT NULL
    AND p.due_date < v_reference_date
  ON CONFLICT (alert_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  RETURN jsonb_build_object(
    'inserted', v_total,
    'reference', v_reference,
    'pending_total', (
      SELECT COUNT(*)
      FROM public.admin_alert_queue q
      WHERE q.status = 'pending'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_alert_queue(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_generate_alert_queue(timestamptz) TO service_role;

COMMENT ON FUNCTION public.admin_generate_alert_queue(timestamptz) IS
  'Genera cola automatica de alertas para recordatorios de clase, vencimientos, pocas clases y pagos atrasados.';

-- --------------------------------------------------------------------------
-- FINANZAS ACCIONABLES
-- --------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_finances_actionable_dashboard(date, date, date);
CREATE OR REPLACE FUNCTION public.get_finances_actionable_dashboard(
  p_month_start date,
  p_month_end date,
  p_reference_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(auth.role(), '');
  v_paid_month numeric := 0;
  v_pending_month numeric := 0;
  v_projection_month numeric := 0;
  v_overdue_amount numeric := 0;
  v_overdue_count integer := 0;
  v_top_debtors jsonb := '[]'::jsonb;
  v_overdue_rows jsonb := '[]'::jsonb;
  v_alerts_pending integer := 0;
BEGIN
  IF p_month_end <= p_month_start THEN
    RAISE EXCEPTION 'Rango de fechas invalido';
  END IF;

  IF v_role <> 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(SUM(entry.amount), 0)
  INTO v_paid_month
  FROM (
    SELECT p.amount
    FROM public.student_membership_payments p
    WHERE p.payment_status = 'paid'
      AND p.paid_at >= p_month_start
      AND p.paid_at < p_month_end
      AND COALESCE(p.source, '') <> 'migration'

    UNION ALL

    SELECT ip.amount
    FROM public.intro_payments ip
    WHERE ip.paid_at >= p_month_start
      AND ip.paid_at < p_month_end
  ) entry;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_pending_month
  FROM public.student_membership_payments p
  WHERE p.payment_status IN ('pending', 'late')
    AND p.due_date IS NOT NULL
    AND p.due_date >= p_month_start
    AND p.due_date < p_month_end;

  v_projection_month := COALESCE(v_paid_month, 0) + COALESCE(v_pending_month, 0);

  SELECT
    COALESCE(SUM(p.amount), 0),
    COUNT(*)
  INTO v_overdue_amount, v_overdue_count
  FROM public.student_membership_payments p
  WHERE p.payment_status IN ('pending', 'late')
    AND p.due_date IS NOT NULL
    AND p.due_date < p_reference_date;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_top_debtors
  FROM (
    SELECT
      p.student_id,
      s.full_name AS student_name,
      COUNT(*)::integer AS overdue_count,
      ROUND(SUM(p.amount)::numeric, 2) AS overdue_amount,
      MIN(p.due_date) AS oldest_due_date
    FROM public.student_membership_payments p
    INNER JOIN public.students s ON s.id = p.student_id
    WHERE p.payment_status IN ('pending', 'late')
      AND p.due_date IS NOT NULL
      AND p.due_date < p_reference_date
    GROUP BY p.student_id, s.full_name
    ORDER BY overdue_amount DESC, overdue_count DESC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_overdue_rows
  FROM (
    SELECT
      p.id AS payment_id,
      p.student_id,
      s.full_name AS student_name,
      sm.custom_name AS membership_name,
      p.amount,
      p.currency,
      p.payment_status,
      p.due_date,
      GREATEST((p_reference_date - p.due_date), 0)::integer AS days_late
    FROM public.student_membership_payments p
    INNER JOIN public.students s ON s.id = p.student_id
    INNER JOIN public.student_memberships sm ON sm.id = p.student_membership_id
    WHERE p.payment_status IN ('pending', 'late')
      AND p.due_date IS NOT NULL
      AND p.due_date < p_reference_date
    ORDER BY p.due_date ASC
    LIMIT 30
  ) t;

  SELECT COUNT(*)
  INTO v_alerts_pending
  FROM public.admin_alert_queue q
  WHERE q.status = 'pending';

  RETURN jsonb_build_object(
    'month_start', p_month_start,
    'month_end', p_month_end,
    'reference_date', p_reference_date,
    'paid_month', ROUND(COALESCE(v_paid_month, 0)::numeric, 2),
    'pending_month', ROUND(COALESCE(v_pending_month, 0)::numeric, 2),
    'projection_month', ROUND(COALESCE(v_projection_month, 0)::numeric, 2),
    'overdue_amount', ROUND(COALESCE(v_overdue_amount, 0)::numeric, 2),
    'overdue_count', COALESCE(v_overdue_count, 0),
    'pending_alerts', COALESCE(v_alerts_pending, 0),
    'top_debtors', v_top_debtors,
    'overdue_rows', v_overdue_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finances_actionable_dashboard(date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finances_actionable_dashboard(date, date, date) TO service_role;

COMMENT ON FUNCTION public.get_finances_actionable_dashboard(date, date, date) IS
  'Retorna morosidad, proyeccion mensual y detalle de atrasos para dashboard financiero admin.';
