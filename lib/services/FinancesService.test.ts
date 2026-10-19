import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  const chain = { order: vi.fn(), range: vi.fn() }
  return { rpc: vi.fn(), chain }
})
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }))
import { FinancesService } from './FinancesService'

describe('finance sales attribution', () => {
  const record = { payment_id: 'payment', sale_at: '2026-08-26T23:30:00Z', paid_at: '2026-10-19T17:00:00Z', amount_paid: 240, payment_status: 'paid', movement_kind: 'membership' }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReturnValue(mocks.chain)
    mocks.chain.order.mockReturnValue(mocks.chain)
  })
  it('uses the sales RPC and keeps sale and collection dates distinct', async () => {
    mocks.chain.range.mockResolvedValue({ data: [record], error: null })
    const result = await FinancesService.getMonthlyReport('2026-08-01','2026-09-01')
    expect(mocks.rpc).toHaveBeenCalledWith('get_finances_sales_report', { p_start_date: '2026-08-01', p_end_date: '2026-09-01' })
    expect(mocks.chain.order).toHaveBeenCalledWith('sale_at', { ascending: false })
    expect(result[0]).toMatchObject({ sale_at: record.sale_at, paid_at: record.paid_at })
  })
  it('loads every page and rejects incomplete date information', async () => {
    mocks.chain.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, index) => ({ ...record, payment_id: String(index) })), error: null }).mockResolvedValueOnce({ data: [{ ...record, payment_id: '500' }], error: null })
    expect(await FinancesService.getMonthlyReport('2026-08-01','2026-09-01')).toHaveLength(501)
    expect(mocks.chain.range.mock.calls).toEqual([[0,499],[500,999]])
    expect(mocks.chain.order).toHaveBeenCalledWith('payment_id', { ascending: true })
    mocks.chain.range.mockResolvedValueOnce({ data: [{ ...record, sale_at: null }], error: null })
    await expect(FinancesService.getMonthlyReport('2026-08-01','2026-09-01')).rejects.toThrow('fecha de venta')
    mocks.chain.range.mockResolvedValueOnce({ data: null, error: null })
    await expect(FinancesService.getMonthlyReport('2026-08-01','2026-09-01')).rejects.toThrow('incompleto')
  })
  it('does not fall back to a report by collection date when the server fails', async () => {
    mocks.chain.range.mockResolvedValue({ data: null, error: new Error('Missing RPC') })
    await expect(FinancesService.getMonthlyReport('2026-08-01','2026-09-01')).rejects.toThrow('Missing RPC')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects a later-page failure instead of displaying partial income', async () => {
    mocks.chain.range.mockResolvedValueOnce({ data: Array(500).fill(record), error: null }).mockResolvedValueOnce({ data: null, error: new Error('Read failed') })
    await expect(FinancesService.getMonthlyReport('2026-08-01','2026-09-01')).rejects.toThrow('Read failed')
  })
})
