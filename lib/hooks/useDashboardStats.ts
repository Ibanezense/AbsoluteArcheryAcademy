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
  facturacion_mes_actual: number
  membresias_por_vencer: number
  alumnos_sin_clases: number
  ocupacion_semana_pct: number
  turnos_disponibles_semana: number
  ocupacion_por_dia: DailyOccupancy[]
}

// Un estado inicial vacío
const initialState: DashboardStats = {
  total_alumnos_activos: 0,
  facturacion_mes_actual: 0,
  membresias_por_vencer: 0,
  alumnos_sin_clases: 0,
  ocupacion_semana_pct: 0,
  turnos_disponibles_semana: 0,
  ocupacion_por_dia: [],
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
      setStats(parsedData as DashboardStats)
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
