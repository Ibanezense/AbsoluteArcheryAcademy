import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchCapacity: vi.fn(),
  refetch: vi.fn(),
  rpc: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: mocks.rpc },
}))

vi.mock('@/lib/services/adminWeekendIntroCapacityService', () => ({
  fetchAdminWeekendIntroCapacity: mocks.fetchCapacity,
}))

import { useAdminWeekendIntroCapacity } from '@/lib/hooks/useAdminDashboardData'

type CapturedQueryOptions = {
  queryKey: readonly unknown[]
  queryFn: () => Promise<unknown>
  staleTime: number
  refetchOnWindowFocus: boolean
}

describe('useAdminWeekendIntroCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries the Lima reference date with an isolated key and live refresh settings', async () => {
    mocks.fetchCapacity.mockResolvedValue([])
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: mocks.refetch,
    })

    const result = useAdminWeekendIntroCapacity(new Date('2026-08-17T03:30:00Z'))
    const options = mocks.useQuery.mock.calls[0][0] as CapturedQueryOptions

    expect(options.queryKey).toEqual(['admin-weekend-intro-capacity', '2026-08-16'])
    expect(options.staleTime).toBe(30_000)
    expect(options.refetchOnWindowFocus).toBe(true)

    await options.queryFn()
    expect(mocks.fetchCapacity).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: mocks.rpc }),
      '2026-08-16',
    )
    expect(result).toEqual({
      sessions: [],
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: mocks.refetch,
    })
  })

  it('returns fetched sessions and normalizes known and unknown errors', () => {
    const sessions = [{ sessionId: 'session-1' }]
    mocks.useQuery.mockReturnValueOnce({
      data: sessions,
      isLoading: false,
      isFetching: false,
      error: new Error('Sin conexión'),
      refetch: mocks.refetch,
    })

    const knownErrorResult = useAdminWeekendIntroCapacity()
    expect(knownErrorResult.sessions).toBe(sessions)
    expect(knownErrorResult.error).toBe('Sin conexión')

    mocks.useQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: { code: 'UNKNOWN' },
      refetch: mocks.refetch,
    })

    const unknownErrorResult = useAdminWeekendIntroCapacity()
    expect(unknownErrorResult.sessions).toEqual([])
    expect(unknownErrorResult.error).toBe('Error desconocido')
  })
})
