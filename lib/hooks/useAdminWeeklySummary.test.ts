import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  now: null as Date | null,
  effect: null as (() => () => void) | null,
  useQuery: vi.fn(), fetch: vi.fn(),
}))
vi.mock('react', () => ({
  useState: (init: () => Date) => [mocks.now ??= init(), (value: Date) => { mocks.now = value }],
  useEffect: (effect: () => () => void) => { mocks.effect = effect },
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/services/adminWeeklySummaryService', () => ({ fetchAdminWeeklySummary: mocks.fetch }))
import { useAdminWeeklySummary } from './useAdminWeeklySummary'

describe('weekly clock and query refresh', () => {
  const focus = new Map<string, () => void>()
  const visible = new Map<string, () => void>()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.now = null
    focus.clear(); visible.clear()
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: (name: string, handler: () => void) => focus.set(name, handler), removeEventListener: (name: string) => focus.delete(name) })
    vi.stubGlobal('document', { addEventListener: (name: string, handler: () => void) => visible.set(name, handler), removeEventListener: (name: string) => visible.delete(name) })
    mocks.useQuery.mockReturnValue({ data: undefined })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('switches the cache cohort at Monday midnight without a page reload', async () => {
    vi.setSystemTime(new Date('2026-10-19T04:59:59.999Z'))
    expect(useAdminWeeklySummary().week.startDate).toBe('2026-10-12')
    const cleanup = mocks.effect!()
    vi.advanceTimersByTime(51)
    expect(useAdminWeeklySummary().week.startDate).toBe('2026-10-19')
    const query = mocks.useQuery.mock.calls.at(-1)![0]
    expect(query.queryKey).toEqual(['admin-dashboard-operational','weekly-summary','2026-10-19'])
    expect(query.refetchInterval).toBe(60_000)
    expect(query.refetchOnWindowFocus).toBe(true)
    await query.queryFn()
    expect(mocks.fetch).toHaveBeenCalledWith('2026-10-19')
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
    expect(focus.size + visible.size).toBe(0)
  })
  it('catches up after the tab sleeps across the boundary', () => {
    vi.setSystemTime(new Date('2026-10-18T20:00:00Z'))
    useAdminWeeklySummary()
    const cleanup = mocks.effect!()
    vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))
    focus.get('focus')!()
    expect(useAdminWeeklySummary().week.startDate).toBe('2026-10-19')
    cleanup()
  })
})
