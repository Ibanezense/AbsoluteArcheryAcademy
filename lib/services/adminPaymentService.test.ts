import { beforeEach, describe, expect, it, vi } from 'vitest'
const { from, chain, getUser } = vi.hoisted(() => {
  const chain: Record<string, any> = {}
  for (const key of ['select', 'update', 'eq', 'neq', 'in', 'order', 'range', 'maybeSingle']) chain[key] = vi.fn()
  return { chain, from: vi.fn(), getUser: vi.fn() }
})
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from, auth: { getUser } } }))
import { collectMembershipPayment, getPendingMembershipPayments } from './adminPaymentService'

describe('pending membership collections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    from.mockReturnValue(chain)
    Object.values(chain).forEach((fn: any) => fn.mockReturnValue(chain))
    getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null })
    chain.maybeSingle.mockResolvedValue({ data: { id: 'payment' }, error: null })
  })
  const input = { paymentId: 'payment', studentId: 'student', expectedAmount: 0, amount: '160.50', method: 'yape', date: '2026-10-19' }
  it('updates the existing pending payment, with real collection details and a status guard', async () => {
    await collectMembershipPayment(input)
    expect(from).toHaveBeenCalledWith('student_membership_payments')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ amount: 160.5, payment_status: 'paid', payment_method: 'yape', paid_at: '2026-10-19T12:00:00-05:00', recorded_by_profile_id: 'admin' }))
    expect(chain.eq).toHaveBeenCalledWith('id', 'payment')
    expect(chain.eq).toHaveBeenCalledWith('student_id', 'student')
    expect(chain.neq).toHaveBeenCalledWith('source', 'migration')
    expect(chain.in).toHaveBeenCalledWith('payment_status', ['pending', 'late'])
  })
  it.each(['', '0', '-1', 'NaN', '1.001', '1e3'])('rejects invalid received amount %s without writing', async amount => {
    await expect(collectMembershipPayment({ ...input, amount })).rejects.toThrow()
    expect(chain.update).not.toHaveBeenCalled()
  })
  it('rejects an undefined method or invalid date without writing', async () => {
    await expect(collectMembershipPayment({ ...input, method: 'manual' })).rejects.toThrow()
    await expect(collectMembershipPayment({ ...input, date: '2026-02-30' })).rejects.toThrow()
    expect(chain.update).not.toHaveBeenCalled()
  })
  it('does not settle an existing amount with a different collection', async () => {
    await expect(collectMembershipPayment({ ...input, expectedAmount: 180 })).rejects.toThrow('completo')
    expect(chain.update).not.toHaveBeenCalled()
  })
  it('does not report success when a payment was already processed or access was denied', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(collectMembershipPayment(input)).rejects.toThrow('actualizó')
  })
  it('propagates database failures', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: new Error('Write failed') })
    await expect(collectMembershipPayment(input)).rejects.toThrow('Write failed')
  })
  it('requires an authenticated actor before writing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(collectMembershipPayment(input)).rejects.toThrow()
    expect(chain.update).not.toHaveBeenCalled()
  })
  it('reads all pending payments, including those without a due date, and scopes student queries', async () => {
    chain.range.mockResolvedValueOnce({ data: Array(500).fill({ id: 'p' }), error: null }).mockResolvedValueOnce({ data: [{ id: 'last' }], error: null })
    const result = await getPendingMembershipPayments('student')
    expect(result).toHaveLength(501)
    expect(chain.eq).toHaveBeenCalledWith('student_id', 'student')
    expect(chain.neq).toHaveBeenCalledWith('source', 'migration')
    expect(chain.range.mock.calls).toEqual([[0, 499], [500, 999]])
  })
})
