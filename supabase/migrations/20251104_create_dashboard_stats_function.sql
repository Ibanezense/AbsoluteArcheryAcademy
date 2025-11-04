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

  -- Construir JSON con todas las métricas
  v_result := json_build_object(
    'total_alumnos_activos', v_total_alumnos_activos,
    'facturacion_mes_actual', v_facturacion_mes_actual,
    'membresias_por_vencer', v_membresias_por_vencer,
    'alumnos_sin_clases', v_alumnos_sin_clases
  );

  RETURN v_result;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION get_dashboard_stats IS 
  'Retorna métricas clave del dashboard: alumnos activos, facturación mensual, membresías por vencer y alumnos sin clases. 
   Timezone: America/Lima (UTC-5)';

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
--   "alumnos_sin_clases": 3
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
-- }
-- ============================================================================
