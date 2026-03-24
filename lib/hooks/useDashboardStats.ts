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
  clases_prueba_mes_actual: number
  alumnos_principiantes: number
  alumnos_en_desarrollo: number
  alumnos_avanzados: number
  alumnos_competitivos: number
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
  clases_prueba_mes_actual: 0,
  alumnos_principiantes: 0,
  alumnos_en_desarrollo: 0,
  alumnos_avanzados: 0,
  alumnos_competitivos: 0,
}

export function normalizeDashboardStats(parsedData: Partial<DashboardStats> | null | undefined) {
  const source = parsedData ?? {}

  return {
    ...initialState,
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

function normalizeLevel(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

async function loadDashboardKpiFallback(): Promise<Partial<DashboardStats>> {
  const fallback: Partial<DashboardStats> = {}

  const { data: studentsData, error: studentsError } = await supabase
    .from('students')
    .select('level, is_active')
    .eq('is_active', true)

  if (!studentsError && Array.isArray(studentsData)) {
    let principiantes = 0
    let desarrollo = 0
    let avanzados = 0
    let competitivos = 0

    for (const row of studentsData) {
      const normalized = normalizeLevel((row as any)?.level)
      if (!normalized) continue
      if (normalized.includes('competit')) {
        competitivos += 1
      } else if (normalized.includes('avanzad')) {
        avanzados += 1
      } else if (normalized.includes('desarroll')) {
        desarrollo += 1
      } else if (normalized.includes('princip')) {
        principiantes += 1
      }
    }

    fallback.alumnos_principiantes = principiantes
    fallback.alumnos_en_desarrollo = desarrollo
    fallback.alumnos_avanzados = avanzados
    fallback.alumnos_competitivos = competitivos
  }

  // Fallback solo para no dejar la card vacia si la RPC vieja aun no trae este KPI.
  const { data: introRows, error: introError } = await supabase
    .from('bookings')
    .select('intro_client_id, status, sessions!inner(start_at)')
    .not('intro_client_id', 'is', null)
    .in('status', ['reserved', 'attended', 'no_show'])

  if (!introError && Array.isArray(introRows)) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const count = introRows.reduce((acc, row: any) => {
      const sessionStartRaw = Array.isArray(row.sessions)
        ? row.sessions[0]?.start_at
        : row.sessions?.start_at
      if (!sessionStartRaw) return acc
      const sessionStart = new Date(sessionStartRaw)
      if (sessionStart >= monthStart && sessionStart < monthEnd) return acc + 1
      return acc
    }, 0)

    fallback.clases_prueba_mes_actual = count
  }

  return fallback
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
      const statsFromRpc = normalizeDashboardStats(parsedData as Partial<DashboardStats>)

      const hasNewKpis =
        typeof (parsedData as any)?.clases_prueba_mes_actual === 'number' &&
        typeof (parsedData as any)?.alumnos_principiantes === 'number' &&
        typeof (parsedData as any)?.alumnos_en_desarrollo === 'number' &&
        typeof (parsedData as any)?.alumnos_avanzados === 'number' &&
        typeof (parsedData as any)?.alumnos_competitivos === 'number'

      if (!hasNewKpis) {
        const fallbackStats = await loadDashboardKpiFallback()
        setStats({
          ...statsFromRpc,
          ...fallbackStats,
        })
      } else {
        setStats(statsFromRpc)
      }
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
