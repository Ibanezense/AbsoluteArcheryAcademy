-- ============================================================================
-- RESERVATION ENGINE V3
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Modelar inventario de arcos por libraje
-- 2. Modelar plantillas semanales de turnos y cupos por distancia
-- 3. Migrar la logica de reservas a distancia + inventario por libraje
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bow_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_weight_lbs integer NOT NULL UNIQUE CHECK (draw_weight_lbs > 0),
  quantity_total integer NOT NULL CHECK (quantity_total >= 0),
  quantity_active integer NOT NULL CHECK (quantity_active >= 0 AND quantity_active <= quantity_total),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bow_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bow_inventory_read_v3 ON public.bow_inventory;
CREATE POLICY bow_inventory_read_v3
  ON public.bow_inventory
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS bow_inventory_admin_write_v3 ON public.bow_inventory;
CREATE POLICY bow_inventory_admin_write_v3
  ON public.bow_inventory
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE TABLE IF NOT EXISTS public.weekly_session_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_session_templates_time_chk CHECK (end_time > start_time)
);

ALTER TABLE public.weekly_session_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_session_templates_read_v3 ON public.weekly_session_templates;
CREATE POLICY weekly_session_templates_read_v3
  ON public.weekly_session_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS weekly_session_templates_admin_write_v3 ON public.weekly_session_templates;
CREATE POLICY weekly_session_templates_admin_write_v3
  ON public.weekly_session_templates
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE TABLE IF NOT EXISTS public.weekly_session_template_distances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_template_id uuid NOT NULL REFERENCES public.weekly_session_templates(id) ON DELETE CASCADE,
  distance_m integer NOT NULL CHECK (distance_m > 0),
  slot_capacity integer NOT NULL CHECK (slot_capacity >= 0),
  targets integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_session_template_distances_unique UNIQUE (weekly_template_id, distance_m)
);

ALTER TABLE public.weekly_session_template_distances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_session_template_distances_read_v3 ON public.weekly_session_template_distances;
CREATE POLICY weekly_session_template_distances_read_v3
  ON public.weekly_session_template_distances
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS weekly_session_template_distances_admin_write_v3 ON public.weekly_session_template_distances;
CREATE POLICY weekly_session_template_distances_admin_write_v3
  ON public.weekly_session_template_distances
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS weekly_template_id uuid REFERENCES public.weekly_session_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.session_distance_allocations
  ADD COLUMN IF NOT EXISTS slot_capacity integer;

UPDATE public.session_distance_allocations
SET slot_capacity = targets * 4
WHERE slot_capacity IS NULL;

ALTER TABLE public.session_distance_allocations
  ALTER COLUMN slot_capacity SET DEFAULT 0;

ALTER TABLE public.session_distance_allocations
  DROP CONSTRAINT IF EXISTS session_distance_allocations_slot_capacity_chk;

ALTER TABLE public.session_distance_allocations
  ADD CONSTRAINT session_distance_allocations_slot_capacity_chk CHECK (slot_capacity >= 0);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS bow_poundage integer,
  ADD COLUMN IF NOT EXISTS bow_usage_type text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_bow_usage_type_chk;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_bow_usage_type_chk CHECK (
    bow_usage_type IS NULL
    OR bow_usage_type IN ('shared_inventory', 'assigned', 'own')
  );

UPDATE public.bookings b
SET
  bow_poundage = s.bow_poundage,
  bow_usage_type = CASE
    WHEN s.has_own_bow THEN 'own'
    WHEN s.assigned_bow THEN 'assigned'
    WHEN s.bow_poundage IS NOT NULL THEN 'shared_inventory'
    ELSE NULL
  END
FROM public.students s
WHERE b.student_id = s.id
  AND (b.bow_poundage IS NULL OR b.bow_usage_type IS NULL);

CREATE OR REPLACE FUNCTION public.update_bow_inventory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bow_inventory_updated_at_trigger ON public.bow_inventory;
CREATE TRIGGER bow_inventory_updated_at_trigger
  BEFORE UPDATE ON public.bow_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bow_inventory_updated_at();

CREATE OR REPLACE FUNCTION public.update_weekly_session_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_session_templates_updated_at_trigger ON public.weekly_session_templates;
CREATE TRIGGER weekly_session_templates_updated_at_trigger
  BEFORE UPDATE ON public.weekly_session_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_weekly_session_templates_updated_at();

DROP TRIGGER IF EXISTS weekly_session_template_distances_updated_at_trigger ON public.weekly_session_template_distances;
CREATE TRIGGER weekly_session_template_distances_updated_at_trigger
  BEFORE UPDATE ON public.weekly_session_template_distances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_weekly_session_templates_updated_at();

DROP FUNCTION IF EXISTS public.check_session_availability_v3(uuid, uuid);
CREATE OR REPLACE FUNCTION public.check_session_availability_v3(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_distance_capacity integer;
  v_reserved_distance integer;
  v_bow_capacity integer;
  v_reserved_bows integer;
  v_distance_remaining integer;
  v_bow_remaining integer;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'Alumno no encontrado');
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'El alumno no tiene distancia configurada');
  END IF;

  SELECT COALESCE(sda.slot_capacity, sda.targets * 4, 0)
  INTO v_distance_capacity
  FROM public.session_distance_allocations sda
  WHERE sda.session_id = p_session_id
    AND sda.distance_m = v_student.current_distance_m;

  IF COALESCE(v_distance_capacity, 0) <= 0 THEN
    RETURN jsonb_build_object('available', false, 'message', 'No hay cupos configurados para esa distancia');
  END IF;

  SELECT COUNT(*)
  INTO v_reserved_distance
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.distance_m = v_student.current_distance_m
    AND b.status = 'reserved';

  v_distance_remaining := GREATEST(v_distance_capacity - v_reserved_distance, 0);

  IF v_distance_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'No hay cupos disponibles para esta distancia',
      'distance_capacity', v_distance_capacity,
      'distance_reserved', v_reserved_distance
    );
  END IF;

  v_bow_usage_type := CASE
    WHEN v_student.has_own_bow THEN 'own'
    WHEN v_student.assigned_bow THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  IF v_bow_usage_type IN ('own', 'assigned') THEN
    RETURN jsonb_build_object(
      'available', true,
      'message', 'Cupo disponible',
      'bow_usage_type', v_bow_usage_type,
      'distance_capacity', v_distance_capacity,
      'distance_reserved', v_reserved_distance,
      'spots_for_student', v_distance_remaining
    );
  END IF;

  IF v_student.bow_poundage IS NULL THEN
    RETURN jsonb_build_object('available', false, 'message', 'El alumno no tiene libraje configurado');
  END IF;

  SELECT bi.quantity_active
  INTO v_bow_capacity
  FROM public.bow_inventory bi
  WHERE bi.draw_weight_lbs = v_student.bow_poundage;

  IF COALESCE(v_bow_capacity, 0) <= 0 THEN
    RETURN jsonb_build_object('available', false, 'message', 'No hay inventario activo para ese libraje');
  END IF;

  SELECT COUNT(*)
  INTO v_reserved_bows
  FROM public.bookings b
  WHERE b.session_id = p_session_id
    AND b.status = 'reserved'
    AND b.bow_usage_type = 'shared_inventory'
    AND b.bow_poundage = v_student.bow_poundage;

  v_bow_remaining := GREATEST(v_bow_capacity - v_reserved_bows, 0);

  IF v_bow_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'No hay arcos disponibles para ese libraje en este turno',
      'bow_capacity', v_bow_capacity,
      'bow_reserved', v_reserved_bows
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'message', 'Cupo disponible',
    'bow_usage_type', v_bow_usage_type,
    'distance_capacity', v_distance_capacity,
    'distance_reserved', v_reserved_distance,
    'bow_capacity', v_bow_capacity,
    'bow_reserved', v_reserved_bows,
    'spots_for_student', LEAST(v_distance_remaining, v_bow_remaining)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_session_availability_v3(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_available_sessions_for_student(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_available_sessions_for_student(
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
  slot_capacity integer,
  distance_reserved integer,
  bow_capacity integer,
  bow_reserved integer,
  spots_for_student integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_student public.students;
  v_bow_usage_type text;
BEGIN
  v_student_id := public.resolve_accessible_student_id(p_student_id);

  SELECT *
  INTO v_student
  FROM public.students
  WHERE id = v_student_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Alumno no encontrado';
  END IF;

  IF v_student.current_distance_m IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene distancia configurada';
  END IF;

  v_bow_usage_type := CASE
    WHEN v_student.has_own_bow THEN 'own'
    WHEN v_student.assigned_bow THEN 'assigned'
    ELSE 'shared_inventory'
  END;

  RETURN QUERY
  WITH distance_caps AS (
    SELECT
      s.id AS session_id,
      s.start_at,
      s.end_at,
      s.status,
      v_student.current_distance_m AS distance_m,
      COALESCE(sda.slot_capacity, sda.targets * 4, 0) AS slot_capacity
    FROM public.sessions s
    LEFT JOIN public.session_distance_allocations sda
      ON sda.session_id = s.id
     AND sda.distance_m = v_student.current_distance_m
    WHERE DATE(s.start_at AT TIME ZONE 'America/Lima') BETWEEN p_date_from AND p_date_to
  ),
  student_reservations AS (
    SELECT
      b.session_id,
      true AS already_reserved
    FROM public.bookings b
    WHERE b.student_id = v_student_id
      AND b.status = 'reserved'
  ),
  distance_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.distance_m = v_student.current_distance_m
      AND b.status = 'reserved'
    GROUP BY b.session_id
  ),
  bow_reserved AS (
    SELECT
      b.session_id,
      COUNT(*)::integer AS reserved_count
    FROM public.bookings b
    WHERE b.status = 'reserved'
      AND b.bow_usage_type = 'shared_inventory'
      AND b.bow_poundage = v_student.bow_poundage
    GROUP BY b.session_id
  )
  SELECT
    dc.session_id,
    dc.start_at,
    dc.end_at,
    dc.status::text,
    COALESCE(sr.already_reserved, false) AS already_reserved,
    dc.distance_m,
    v_bow_usage_type,
    dc.slot_capacity,
    COALESCE(dr.reserved_count, 0) AS distance_reserved,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(bi.quantity_active, 0)
      ELSE NULL
    END AS bow_capacity,
    CASE
      WHEN v_bow_usage_type = 'shared_inventory' THEN COALESCE(br.reserved_count, 0)
      ELSE NULL
    END AS bow_reserved,
    CASE
      WHEN dc.status <> 'scheduled' THEN 0
      WHEN dc.start_at <= now() THEN 0
      WHEN COALESCE(sr.already_reserved, false) THEN 0
      WHEN dc.slot_capacity <= 0 THEN 0
      WHEN v_bow_usage_type IN ('own', 'assigned')
        THEN GREATEST(dc.slot_capacity - COALESCE(dr.reserved_count, 0), 0)
      ELSE GREATEST(
        LEAST(
          dc.slot_capacity - COALESCE(dr.reserved_count, 0),
          COALESCE(bi.quantity_active, 0) - COALESCE(br.reserved_count, 0)
        ),
        0
      )
    END AS spots_for_student
  FROM distance_caps dc
  LEFT JOIN student_reservations sr
    ON sr.session_id = dc.session_id
  LEFT JOIN distance_reserved dr
    ON dr.session_id = dc.session_id
  LEFT JOIN bow_reserved br
    ON br.session_id = dc.session_id
  LEFT JOIN public.bow_inventory bi
    ON bi.draw_weight_lbs = v_student.bow_poundage
  ORDER BY dc.start_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) TO authenticated;

COMMENT ON TABLE public.bow_inventory IS
  'Inventario de arcos compartidos por libraje. assigned y own no consumen este stock.';

COMMENT ON TABLE public.weekly_session_templates IS
  'Plantillas semanales de turnos recurrentes. Cada sesion real puede heredar de una plantilla y luego modificarse manualmente.';

COMMENT ON TABLE public.weekly_session_template_distances IS
  'Cupos por distancia para una plantilla semanal. Las sesiones reales heredan estos cupos y pueden sobrescribirse.';

COMMENT ON COLUMN public.session_distance_allocations.slot_capacity IS
  'Cupo directo por distancia para el turno. Si es null en datos legacy, usar targets * 4.';

COMMENT ON COLUMN public.bookings.bow_usage_type IS
  'Snapshot tecnico del tipo de uso del arco al momento de la reserva: shared_inventory, assigned u own.';

COMMENT ON FUNCTION public.check_session_availability_v3(uuid, uuid) IS
  'Evalua disponibilidad real del turno para un alumno segun cupo por distancia y stock de arcos por libraje.';

COMMENT ON FUNCTION public.get_available_sessions_for_student(uuid, date, date) IS
  'Lista turnos y spots reales para un alumno considerando distancia, arco propio/asignado e inventario por libraje.';
