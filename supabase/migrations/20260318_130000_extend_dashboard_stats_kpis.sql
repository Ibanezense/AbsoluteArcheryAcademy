-- ============================================================================
-- DASHBOARD KPIS: CLASES INTRO Y NIVELES ACTIVOS
-- Fecha: 2026-03-18
-- Proposito:
-- 1. Agregar KPI de clases de prueba del mes
-- 2. Agregar KPIs de niveles (solo alumnos activos)
-- 3. Alinear metricas base al modelo V2 (students + memberships)
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_lima date := (now() AT TIME ZONE 'America/Lima')::date;
  v_month_start_lima timestamp := date_trunc('month', now() AT TIME ZONE 'America/Lima');
  v_month_end_lima timestamp := date_trunc('month', now() AT TIME ZONE 'America/Lima') + INTERVAL '1 month';
  v_total_alumnos_activos integer := 0;
  v_facturacion_mes_actual integer := 0;
  v_membresias_por_vencer integer := 0;
  v_alumnos_sin_clases integer := 0;
  v_ocupacion_semana_pct integer := 0;
  v_turnos_disponibles_semana integer := 0;
  v_ocupacion_por_dia jsonb := '[]'::jsonb;
  v_clases_prueba_mes_actual integer := 0;
  v_alumnos_principiantes integer := 0;
  v_alumnos_en_desarrollo integer := 0;
  v_alumnos_avanzados integer := 0;
  v_alumnos_competitivos integer := 0;
BEGIN
  -- 1) Alumnos activos (fuente V2)
  SELECT COUNT(*)::integer
  INTO v_total_alumnos_activos
  FROM public.students s
  WHERE COALESCE(s.is_active, true) = true;

  -- 2) Facturacion del mes actual (pagos de membresias)
  SELECT COALESCE(SUM(p.amount), 0)::integer
  INTO v_facturacion_mes_actual
  FROM public.student_membership_payments p
  WHERE p.payment_status = 'paid'
    AND (p.paid_at AT TIME ZONE 'America/Lima') >= v_month_start_lima
    AND (p.paid_at AT TIME ZONE 'America/Lima') < v_month_end_lima
    AND COALESCE(p.source, '') <> 'migration';

  -- 3) Membresias por vencer (proximos 7 dias) para alumnos activos
  SELECT COUNT(*)::integer
  INTO v_membresias_por_vencer
  FROM public.student_memberships sm
  INNER JOIN public.students s ON s.id = sm.student_id
  WHERE COALESCE(s.is_active, true) = true
    AND sm.status = 'active'
    AND sm.end_date IS NOT NULL
    AND sm.end_date >= v_today_lima
    AND sm.end_date <= v_today_lima + 7;

  -- 4) Alumnos sin clases disponibles (sin membresia vigente con saldo)
  SELECT COUNT(*)::integer
  INTO v_alumnos_sin_clases
  FROM public.students s
  WHERE COALESCE(s.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_memberships sm
      WHERE sm.student_id = s.id
        AND sm.status = 'active'
        AND sm.start_date <= v_today_lima
        AND (sm.end_date IS NULL OR sm.end_date >= v_today_lima)
        AND COALESCE(sm.classes_remaining, 0) > 0
    );

  -- 5) Ocupacion de la semana actual (Lunes a Domingo)
  WITH semana_actual AS (
    SELECT
      date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date AS lunes,
      date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date + INTERVAL '6 days' AS domingo
  ),
  capacidad_semanal AS (
    SELECT
      COALESCE(SUM(ard.targets * 4), 0) AS total_capacity,
      COALESCE(SUM(ard.reserved_count), 0) AS total_reserved
    FROM public.admin_roster_by_distance ard
    INNER JOIN public.sessions s ON s.id = ard.session_id
    CROSS JOIN semana_actual sa
    WHERE s.start_at >= sa.lunes
      AND s.start_at < sa.domingo + INTERVAL '1 day'
      AND s.status = 'scheduled'
  )
  SELECT
    CASE
      WHEN cs.total_capacity > 0
      THEN ROUND((cs.total_reserved::numeric / cs.total_capacity::numeric) * 100)::integer
      ELSE 0
    END
  INTO v_ocupacion_semana_pct
  FROM capacidad_semanal cs;

  -- 6) Turnos disponibles de la semana (con al menos 1 cupo)
  WITH semana_actual AS (
    SELECT
      date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date AS lunes,
      date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date + INTERVAL '6 days' AS domingo
  )
  SELECT COUNT(DISTINCT s.id)::integer
  INTO v_turnos_disponibles_semana
  FROM public.sessions s
  CROSS JOIN semana_actual sa
  WHERE s.start_at >= sa.lunes
    AND s.start_at < sa.domingo + INTERVAL '1 day'
    AND s.status = 'scheduled'
    AND EXISTS (
      SELECT 1
      FROM public.admin_roster_by_distance ard
      WHERE ard.session_id = s.id
        AND (ard.targets * 4) > ard.reserved_count
    );

  -- 7) Ocupacion por dia (Lun..Dom)
  WITH semana_actual AS (
    SELECT
      date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)::date AS lunes
  ),
  dias_semana AS (
    SELECT
      generate_series(0, 6) AS dia_offset,
      ARRAY['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] AS nombres_dias
  ),
  ocupacion_diaria AS (
    SELECT
      ds.nombres_dias[ds.dia_offset + 1] AS day,
      COALESCE(
        CASE
          WHEN SUM(ard.targets * 4) > 0
          THEN ROUND((SUM(ard.reserved_count)::numeric / SUM(ard.targets * 4)::numeric) * 100)::integer
          ELSE 0
        END,
        0
      ) AS ocupacion_pct
    FROM dias_semana ds
    CROSS JOIN semana_actual sa
    LEFT JOIN public.sessions s
      ON DATE(s.start_at AT TIME ZONE 'America/Lima') = sa.lunes + (ds.dia_offset || ' days')::interval
      AND s.status = 'scheduled'
    LEFT JOIN public.admin_roster_by_distance ard ON ard.session_id = s.id
    GROUP BY ds.dia_offset, ds.nombres_dias
    ORDER BY ds.dia_offset
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('day', od.day, 'ocupacion_pct', od.ocupacion_pct)
      ORDER BY
        CASE od.day
          WHEN 'Lun' THEN 1
          WHEN 'Mar' THEN 2
          WHEN 'Mie' THEN 3
          WHEN 'Jue' THEN 4
          WHEN 'Vie' THEN 5
          WHEN 'Sab' THEN 6
          WHEN 'Dom' THEN 7
        END
    ),
    '[]'::jsonb
  )
  INTO v_ocupacion_por_dia
  FROM ocupacion_diaria od;

  -- 8) Clases de prueba del mes (reservadas/atendidas/no_show)
  SELECT COUNT(*)::integer
  INTO v_clases_prueba_mes_actual
  FROM public.bookings b
  INNER JOIN public.sessions s ON s.id = b.session_id
  WHERE b.intro_client_id IS NOT NULL
    AND b.status IN ('reserved', 'attended', 'no_show')
    AND (s.start_at AT TIME ZONE 'America/Lima') >= v_month_start_lima
    AND (s.start_at AT TIME ZONE 'America/Lima') < v_month_end_lima;

  -- 9) Niveles de alumnos activos
  WITH active_students AS (
    SELECT
      CASE
        WHEN level_normalized LIKE '%competit%' THEN 'competitivo'
        WHEN level_normalized LIKE '%avanzad%' THEN 'avanzado'
        WHEN level_normalized LIKE '%desarroll%' THEN 'desarrollo'
        WHEN level_normalized LIKE '%princip%' THEN 'principiante'
        ELSE NULL
      END AS level_bucket
    FROM (
      SELECT regexp_replace(
        trim(
          lower(COALESCE(s.level, ''))
        ),
        '\s+',
        ' ',
        'g'
      ) AS level_normalized
      FROM public.students s
      WHERE COALESCE(s.is_active, true) = true
    ) normalized
  )
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'principiante'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'desarrollo'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'avanzado'), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE level_bucket = 'competitivo'), 0)::integer
  INTO
    v_alumnos_principiantes,
    v_alumnos_en_desarrollo,
    v_alumnos_avanzados,
    v_alumnos_competitivos
  FROM active_students;

  RETURN json_build_object(
    'total_alumnos_activos', v_total_alumnos_activos,
    'facturacion_mes_actual', v_facturacion_mes_actual,
    'membresias_por_vencer', v_membresias_por_vencer,
    'alumnos_sin_clases', v_alumnos_sin_clases,
    'ocupacion_semana_pct', v_ocupacion_semana_pct,
    'turnos_disponibles_semana', v_turnos_disponibles_semana,
    'ocupacion_por_dia', v_ocupacion_por_dia,
    'clases_prueba_mes_actual', v_clases_prueba_mes_actual,
    'alumnos_principiantes', v_alumnos_principiantes,
    'alumnos_en_desarrollo', v_alumnos_en_desarrollo,
    'alumnos_avanzados', v_alumnos_avanzados,
    'alumnos_competitivos', v_alumnos_competitivos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_stats() IS
  'Retorna KPIs del dashboard admin: base operativa, clases de prueba del mes y distribucion de niveles (solo alumnos activos).';
