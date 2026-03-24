import { describe, expect, it, vi } from 'vitest'
import { applyDashboardStatsFallback, normalizeDashboardStats } from '@/lib/hooks/useDashboardStats'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

describe('normalizeDashboardStats', () => {
  it('preserves alumnos_cct_activos from the RPC payload', () => {
    const result = normalizeDashboardStats({
      total_alumnos_activos: 10,
      alumnos_cct_activos: 3,
    })

    expect(result.alumnos_cct_activos).toBe(3)
  })

  it('backfills alumnos_cct_activos when the RPC omits it', () => {
    const statsFromRpc = normalizeDashboardStats({
      total_alumnos_activos: 10,
    })

    const result = applyDashboardStatsFallback(statsFromRpc, {
      alumnos_cct_activos: 4,
    })

    expect(result.alumnos_cct_activos).toBe(4)
    expect(result.total_alumnos_activos).toBe(10)
  })
})
