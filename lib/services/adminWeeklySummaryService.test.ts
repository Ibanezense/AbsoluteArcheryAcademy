import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }))
import { fetchAdminWeeklySummary } from './adminWeeklySummaryService'

describe('weekly summary service', () => {
  beforeEach(() => vi.clearAllMocks())
  it('asks the server for the current calendar week rather than a rolling range', async () => {
    const summary = { startDate: '2026-10-19', endDate: '2026-10-25', reservations: 84, scheduledSessions: 10, availableSlots: null, pendingConfirmations: 2, attendancePending: 20 }
    mocks.rpc.mockResolvedValue({ data: summary, error: null })
    expect(await fetchAdminWeeklySummary('2026-10-19')).toEqual(summary)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_get_weekly_dashboard_summary')
  })
  it('propagates failure and never falls back to daily values or a truncated agenda', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Sin acceso') })
    await expect(fetchAdminWeeklySummary('2026-10-19')).rejects.toThrow('Sin acceso')
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(fetchAdminWeeklySummary('2026-10-19')).rejects.toThrow('resumen completo')
  })
})
