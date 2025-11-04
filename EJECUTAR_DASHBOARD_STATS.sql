-- ============================================================================
-- EJECUTAR ESTE SQL EN SUPABASE - Dashboard Stats Actualizado
-- ============================================================================
-- Instrucciones:
-- 1. Ir a Supabase Dashboard → SQL Editor
-- 2. Copiar y pegar TODO este contenido
-- 3. Hacer clic en "Run"
-- ============================================================================

-- Eliminar función anterior
DROP FUNCTION IF EXISTS get_dashboard_stats();

-- Crear función actualizada con 6 métricas
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
  v_result JSON;
BEGIN
  -- 1. Total de alumnos activos
  SELECT COUNT(*)::INTEGER
  INTO v_total_alumnos_activos
  FROM profiles
  WHERE is_active = true;

  -- 2. Facturación del mes actual (America/Lima timezone)
  SELECT COALESCE(SUM(amount_paid), 0)::INTEGER
  INTO v_facturacion_mes_actual
  FROM profile_memberships
  WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'America/Lima')
    AND created_at < date_trunc('month', NOW() AT TIME ZONE 'America/Lima') + INTERVAL '1 month';

  -- 3. Membresías por vencer (próximos 7 días)
  SELECT COUNT(*)::INTEGER
  INTO v_membresias_por_vencer
  FROM profiles
  WHERE is_active = true
    AND membership_end IS NOT NULL
    AND membership_end >= CURRENT_DATE
    AND membership_end <= CURRENT_DATE + INTERVAL '7 days';

  -- 4. Alumnos sin clases disponibles
  SELECT COUNT(*)::INTEGER
  INTO v_alumnos_sin_clases
  FROM profiles
  WHERE is_active = true
    AND COALESCE(classes_remaining, 0) <= 0;

  -- 5. Ocupación de la semana actual (Lunes a Domingo)
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

  -- Construir JSON con todas las métricas
  v_result := json_build_object(
    'total_alumnos_activos', v_total_alumnos_activos,
    'facturacion_mes_actual', v_facturacion_mes_actual,
    'membresias_por_vencer', v_membresias_por_vencer,
    'alumnos_sin_clases', v_alumnos_sin_clases,
    'ocupacion_semana_pct', v_ocupacion_semana_pct,
    'turnos_disponibles_semana', v_turnos_disponibles_semana
  );

  RETURN v_result;
END;
$$;

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;

-- Comentario
COMMENT ON FUNCTION get_dashboard_stats IS 'Dashboard stats con 6 métricas: alumnos activos, facturación, membresías por vencer, alumnos sin clases, ocupación semanal y turnos disponibles';

-- ============================================================================
-- VERIFICACIÓN (ejecutar después para probar)
-- ============================================================================
-- SELECT * FROM get_dashboard_stats();
