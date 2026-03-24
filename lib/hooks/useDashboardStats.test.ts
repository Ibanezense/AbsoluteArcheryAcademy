import { describe, expect, it, vi } from 'vitest'
import { normalizeDashboardStats } from '@/lib/hooks/useDashboardStats'

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
})
