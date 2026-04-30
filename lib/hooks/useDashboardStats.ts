// Contenido para: lib/hooks/useDashboardStats.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type DailyOccupancy = {
  day: string
  ocupacion_pct: number
}

// Este es el tipo de datos que esperamos de nuestra función RPC
export type DashboardStats = {
  total_alumnos_activos: number
  alumnos_cct_activos: number
  facturacion_mes_actual: number
  membresias_por_vencer: number
  alumnos_sin_clases: number
  ocupacion_semana_pct: number
  turnos_disponibles_semana: number
  ocupacion_por_dia: DailyOccupancy[]
  clases_prueba_mes_actual: number
  alumnos_principiantes: number
  alumnos_en_desarrollo: number
  alumnos_avanzados: number
  alumnos_competitivos: number
}

export type DashboardStatsRpc = DashboardStats & {
  alumnos_cct_activos?: number
}

// Un estado inicial vacío
const initialState: DashboardStats = {
  total_alumnos_activos: 0,
  alumnos_cct_activos: 0,
  facturacion_mes_actual: 0,
  membresias_por_vencer: 0,
  alumnos_sin_clases: 0,
  ocupacion_semana_pct: 0,
  turnos_disponibles_semana: 0,
  ocupacion_por_dia: [],
  clases_prueba_mes_actual: 0,
  alumnos_principiantes: 0,
  alumnos_en_desarrollo: 0,
  alumnos_avanzados: 0,
  alumnos_competitivos: 0,
}

export function normalizeDashboardStats(parsedData: Partial<DashboardStatsRpc> | null | undefined): DashboardStatsRpc {
  const source = parsedData ?? {}

  return {
    ...initialState,
    alumnos_cct_activos:
      typeof source.alumnos_cct_activos === 'number'
        ? source.alumnos_cct_activos
        : initialState.alumnos_cct_activos,
    total_alumnos_activos:
      typeof source.total_alumnos_activos === 'number'
        ? source.total_alumnos_activos
        : initialState.total_alumnos_activos,
    facturacion_mes_actual:
      typeof source.facturacion_mes_actual === 'number'
        ? source.facturacion_mes_actual
        : initialState.facturacion_mes_actual,
    membresias_por_vencer:
      typeof source.membresias_por_vencer === 'number'
        ? source.membresias_por_vencer
        : initialState.membresias_por_vencer,
    alumnos_sin_clases:
      typeof source.alumnos_sin_clases === 'number'
        ? source.alumnos_sin_clases
        : initialState.alumnos_sin_clases,
    ocupacion_semana_pct:
      typeof source.ocupacion_semana_pct === 'number'
        ? source.ocupacion_semana_pct
        : initialState.ocupacion_semana_pct,
    turnos_disponibles_semana:
      typeof source.turnos_disponibles_semana === 'number'
        ? source.turnos_disponibles_semana
        : initialState.turnos_disponibles_semana,
    ocupacion_por_dia: Array.isArray(source.ocupacion_por_dia)
      ? source.ocupacion_por_dia
      : initialState.ocupacion_por_dia,
    clases_prueba_mes_actual:
      typeof source.clases_prueba_mes_actual === 'number'
        ? source.clases_prueba_mes_actual
        : initialState.clases_prueba_mes_actual,
    alumnos_principiantes:
      typeof source.alumnos_principiantes === 'number'
        ? source.alumnos_principiantes
        : initialState.alumnos_principiantes,
    alumnos_en_desarrollo:
      typeof source.alumnos_en_desarrollo === 'number'
        ? source.alumnos_en_desarrollo
        : initialState.alumnos_en_desarrollo,
    alumnos_avanzados:
      typeof source.alumnos_avanzados === 'number'
        ? source.alumnos_avanzados
        : initialState.alumnos_avanzados,
    alumnos_competitivos:
      typeof source.alumnos_competitivos === 'number'
        ? source.alumnos_competitivos
        : initialState.alumnos_competitivos,
  }
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>(initialState)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_dashboard_stats')
      if (rpcError) throw rpcError
      
      // La RPC devuelve el JSON, puede venir como string o como objeto
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data
      setStats(normalizeDashboardStats(parsedData as Partial<DashboardStatsRpc>))
    } catch (err) {
      console.error('Error en useDashboardStats:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar estadísticas')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Cargar al inicio
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Retornamos todo lo que la página necesita
  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats, // Una función para refrescar manualmente
  }
}
