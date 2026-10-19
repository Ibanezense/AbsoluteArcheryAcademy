import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc, range, order } = vi.hoisted(() => ({ rpc: vi.fn(), range: vi.fn(), order: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc } }))
import { FinancesService } from './FinancesService'

describe('finance reports keep the complete period', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.mockReturnValue({ order, range })
    rpc.mockReturnValue({ order })
  })
  it('reads every response page so totals and CSV are not silently truncated', async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ payment_id: String(index) }))
    range.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({ data: [{ payment_id: '500' }], error: null })
    const rows = await FinancesService.getMonthlyReport('2026-10-01', '2026-11-01')
    expect(rows).toHaveLength(501)
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]])
    expect(order).toHaveBeenCalledWith('payment_id', { ascending: true })
  })
  it('rejects a later-page failure instead of displaying partial income', async () => {
    range.mockResolvedValueOnce({ data: Array(500).fill({}), error: null }).mockResolvedValueOnce({ data: null, error: new Error('Read failed') })
    await expect(FinancesService.getMonthlyReport('2026-10-01', '2026-11-01')).rejects.toThrow('Read failed')
  })
})
