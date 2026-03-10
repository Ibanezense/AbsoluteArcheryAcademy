-- ============================================================================
-- WEEKLY SESSION GENERATION RPCS
-- Fecha: 2026-02-28
-- Proposito:
-- 1. Generar sesiones reales desde plantillas semanales activas
-- 2. Copiar cupos por distancia a cada sesion creada
-- 3. Evitar duplicados por weekly_template_id + start_at
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_generate_sessions_from_templates(date, integer);
CREATE OR REPLACE FUNCTION public.admin_generate_sessions_from_templates(
  p_week_start date DEFAULT current_date,
  p_weeks integer DEFAULT 4
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_week_start date;
  v_template record;
  v_session_id uuid;
  v_iteration integer;
  v_session_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_created_count integer := 0;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_weeks < 1 OR p_weeks > 24 THEN
    RAISE EXCEPTION 'p_weeks debe estar entre 1 y 24';
  END IF;

  v_week_start := p_week_start - ((EXTRACT(ISODOW FROM p_week_start)::integer) - 1);

  FOR v_template IN
    SELECT
      wst.id,
      wst.label,
      wst.weekday,
      wst.start_time,
      wst.end_time
    FROM public.weekly_session_templates wst
    WHERE wst.is_active = true
    ORDER BY wst.weekday ASC, wst.start_time ASC
  LOOP
    FOR v_iteration IN 0..(p_weeks - 1) LOOP
      v_session_date := v_week_start + ((v_template.weekday - 1) + (v_iteration * 7));
      v_start_at := timezone('America/Lima', (v_session_date + v_template.start_time)::timestamp);
      v_end_at := timezone('America/Lima', (v_session_date + v_template.end_time)::timestamp);

      IF NOT EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.weekly_template_id = v_template.id
          AND s.start_at = v_start_at
      ) THEN
        INSERT INTO public.sessions (
          start_at,
          end_at,
          status,
          notes,
          weekly_template_id,
          is_manual_override
        )
        VALUES (
          v_start_at,
          v_end_at,
          'scheduled',
          COALESCE(v_template.label, 'Turno semanal generado'),
          v_template.id,
          false
        )
        RETURNING id INTO v_session_id;

        INSERT INTO public.session_distance_allocations (
          session_id,
          distance_m,
          targets,
          slot_capacity
        )
        SELECT
          v_session_id,
          wstd.distance_m,
          CEIL(wstd.slot_capacity::numeric / 4.0)::integer,
          wstd.slot_capacity
        FROM public.weekly_session_template_distances wstd
        WHERE wstd.weekly_template_id = v_template.id
          AND wstd.slot_capacity > 0;

        v_created_count := v_created_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_created_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_sessions_from_templates(date, integer) TO authenticated;

COMMENT ON FUNCTION public.admin_generate_sessions_from_templates(date, integer) IS
  'Genera sesiones reales desde plantillas semanales activas y copia sus cupos por distancia.';
