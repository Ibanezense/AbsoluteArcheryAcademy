-- ============================================================================
-- Función: get_dashboard_stats
-- Fecha: 2025-11-04
-- Descripción: Calcula métricas clave del dashboard para administradores
--              Retorna JSON con 4 métricas principales
-- ============================================================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS get_dashboard_stats();

-- Crear función que retorna las estadísticas del dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_alumnos_activos INTEGER;
  v_facturacion_mes_actual INTEGER;
  v_membresias_por_vencer INTEGER;
  v_alumnos_sin_clases INTEGER;
  v_ocupacion_semana_pct INTEGER;
  v_turnos_disponibles_semana INTEGER;
  v_ocupacion_por_dia JSONB;
  v_result JSON;
BEGIN
  -- 1. Total de alumnos activos
  SELECT COUNT(*)::INTEGER
  INTO v_total_alumnos_activos
  FROM profiles
  WHERE is_active = true;

  -- 2. Facturación del mes actual (America/Lima timezone)
  -- Suma los pagos del mes calendario actual
  SELECT COALESCE(SUM(amount_paid), 0)::INTEGER
  INTO v_facturacion_mes_actual
  FROM profile_memberships
  WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'America/Lima')
    AND created_at < date_trunc('month', NOW() AT TIME ZONE 'America/Lima') + INTERVAL '1 month';

  -- 3. Membresías por vencer (próximos 7 días)
  -- Cuenta perfiles activos cuya membresía vence entre hoy y hoy+7 días
  SELECT COUNT(*)::INTEGER
  INTO v_membresias_por_vencer
  FROM profiles
  WHERE is_active = true
    AND membership_end IS NOT NULL
    AND membership_end >= CURRENT_DATE
    AND membership_end <= CURRENT_DATE + INTERVAL '7 days';

  -- 4. Alumnos sin clases disponibles
  -- Cuenta perfiles activos con 0 o menos clases restantes
  SELECT COUNT(*)::INTEGER
  INTO v_alumnos_sin_clases
  FROM profiles
  WHERE is_active = true
    AND COALESCE(classes_remaining, 0) <= 0;

  -- 5. Ocupación de la semana actual (Lunes a Domingo, America/Lima)
  -- Calcula el porcentaje de plazas ocupadas vs capacidad total de la semana
  WITH semana_actual AS (
    SELECT 
      date_trunc('week', (NOW() AT TIME ZONE 'America/Lima')::date)::date AS lunes,
      date_trunc('week', (NOW() AT TIME ZONE 'America/Lima')::date)::date + INTERVAL '6 days' AS domingo
  ),
  capacidad_semanal AS (
    SELECT 
      COALESCE(SUM(ard.targets * 4), 0) AS total_capacity,
      COALESCE(SUM(ard.reserved_count), 0) AS total_reserved
    FROM admin_roster_by_distance ard
    JOIN sessions s ON s.id = ard.session_id
    CROSS JOIN semana_actual
    WHERE s.start_at >= semana_actual.lunes
      AND s.start_at < semana_actual.domingo + INTERVAL '1 day'
      AND s.status = 'scheduled'
  )
  SELECT 
    CASE 
      WHEN total_capacity > 0 
      THEN ROUND((total_reserved::NUMERIC / total_capacity::NUMERIC) * 100)::INTEGER
      ELSE 0
    END
  INTO v_ocupacion_semana_pct
  FROM capacidad_semanal;

  -- 6. Turnos disponibles en la semana (con cupos libres)
  -- Cuenta sesiones de la semana que tienen al menos 1 cupo disponible
  WITH semana_actual AS (
    SELECT 
      date_trunc('week', (NOW() AT TIME ZONE 'America/Lima')::date)::date AS lunes,
      date_trunc('week', (NOW() AT TIME ZONE 'America/Lima')::date)::date + INTERVAL '6 days' AS domingo
  )
  SELECT COUNT(DISTINCT s.id)::INTEGER
  INTO v_turnos_disponibles_semana
  FROM sessions s
  CROSS JOIN semana_actual
  WHERE s.start_at >= semana_actual.lunes
    AND s.start_at < semana_actual.domingo + INTERVAL '1 day'
    AND s.status = 'scheduled'
    AND EXISTS (
      SELECT 1 
      FROM admin_roster_by_distance ard
      WHERE ard.session_id = s.id
        AND (ard.targets * 4) > ard.reserved_count
    );

  -- 7. Ocupación por día de la semana (Lunes a Domingo)
  -- Calcula el porcentaje de ocupación para cada día
  WITH semana_actual AS (
    SELECT 
      date_trunc('week', (NOW() AT TIME ZONE 'America/Lima')::date)::date AS lunes,
      date_trunc('week', (NOW() AT TIME ZONE 'America/Lima')::date)::date + INTERVAL '6 days' AS domingo
  ),
  dias_semana AS (
    SELECT 
      generate_series(0, 6) AS dia_offset,
      ARRAY['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] AS nombres_dias
  ),
  ocupacion_diaria AS (
    SELECT 
      ds.nombres_dias[ds.dia_offset + 1] AS day,
      COALESCE(
        CASE 
          WHEN SUM(ard.targets * 4) > 0 
          THEN ROUND((SUM(ard.reserved_count)::NUMERIC / SUM(ard.targets * 4)::NUMERIC) * 100)::INTEGER
          ELSE 0
        END, 
        0
      ) AS ocupacion_pct
    FROM dias_semana ds
    CROSS JOIN semana_actual sa
    LEFT JOIN sessions s ON 
      DATE(s.start_at AT TIME ZONE 'America/Lima') = sa.lunes + (ds.dia_offset || ' days')::INTERVAL
      AND s.status = 'scheduled'
    LEFT JOIN admin_roster_by_distance ard ON ard.session_id = s.id
    GROUP BY ds.dia_offset, ds.nombres_dias
    ORDER BY ds.dia_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'day', day,
      'ocupacion_pct', ocupacion_pct
    )
    ORDER BY 
      CASE day
        WHEN 'Lun' THEN 1
        WHEN 'Mar' THEN 2
        WHEN 'Mié' THEN 3
        WHEN 'Jue' THEN 4
        WHEN 'Vie' THEN 5
        WHEN 'Sáb' THEN 6
        WHEN 'Dom' THEN 7
      END
  )
  INTO v_ocupacion_por_dia
  FROM ocupacion_diaria;

  -- Construir JSON con todas las métricas
  v_result := json_build_object(
    'total_alumnos_activos', v_total_alumnos_activos,
    'facturacion_mes_actual', v_facturacion_mes_actual,
    'membresias_por_vencer', v_membresias_por_vencer,
    'alumnos_sin_clases', v_alumnos_sin_clases,
    'ocupacion_semana_pct', v_ocupacion_semana_pct,
    'turnos_disponibles_semana', v_turnos_disponibles_semana,
    'ocupacion_por_dia', v_ocupacion_por_dia
  );

  RETURN v_result;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION get_dashboard_stats IS 
  'Retorna métricas clave del dashboard: alumnos activos, facturación mensual, membresías por vencer, alumnos sin clases, ocupación semanal y turnos disponibles. 
   Timezone: America/Lima (UTC-5). Semana: Lunes a Domingo.';

-- ============================================================================
-- VERIFICACIÓN Y PRUEBAS
-- ============================================================================

-- Verificar que la función se creó correctamente:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_name = 'get_dashboard_stats';

-- Probar la función (ejecutar como admin):
-- SELECT * FROM get_dashboard_stats();

-- Resultado esperado (ejemplo):
-- {
--   "total_alumnos_activos": 45,
--   "facturacion_mes_actual": 12500,
--   "membresias_por_vencer": 8,
--   "alumnos_sin_clases": 3,
--   "ocupacion_semana_pct": 72,
--   "turnos_disponibles_semana": 15
-- }

-- ============================================================================
-- USO EN NEXT.JS
-- ============================================================================
-- 
-- const { data, error } = await supabase.rpc('get_dashboard_stats')
-- 
-- if (error) {
--   console.error('Error:', error)
-- } else {
--   console.log('Total alumnos activos:', data.total_alumnos_activos)
--   console.log('Facturación mes actual: S/.', data.facturacion_mes_actual)
--   console.log('Membresías por vencer:', data.membresias_por_vencer)
--   console.log('Alumnos sin clases:', data.alumnos_sin_clases)
--   console.log('Ocupación semana:', data.ocupacion_semana_pct + '%')
--   console.log('Turnos disponibles semana:', data.turnos_disponibles_semana)
-- }
-- ============================================================================
