import { beforeEach, describe, expect, it, vi } from 'vitest'
const { from, select, order, range } = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), order: vi.fn(), range: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from } }))
import { fetchMembershipGrowthHistory } from './adminMembershipGrowthService'

describe('complete membership growth history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    from.mockReturnValue({ select })
    select.mockReturnValue({ order })
    order.mockReturnValue({ range })
  })
  it('reads beyond 1000 rows, including old history needed to identify first memberships', async () => {
    range.mockResolvedValueOnce({ data: Array(500).fill({}), error: null }).mockResolvedValueOnce({ data: Array(500).fill({}), error: null }).mockResolvedValueOnce({ data: [{ id: 'last' }], error: null })
    expect(await fetchMembershipGrowthHistory()).toHaveLength(1001)
    expect(order).toHaveBeenCalledWith('id', { ascending: true })
    expect(range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]])
  })
  it('fails instead of reporting incomplete monthly counts', async () => {
    range.mockResolvedValueOnce({ data: Array(500).fill({}), error: null }).mockResolvedValueOnce({ data: null, error: new Error('No access') })
    await expect(fetchMembershipGrowthHistory()).rejects.toThrow('No access')
  })
})
