import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveAdminSessionWithAllocations } from './adminSessionsService'
import { supabase } from '@/lib/supabaseClient'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

describe('saveAdminSessionWithAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses one atomic RPC for session fields and distance allocations', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { session_id: 'session-1' },
      error: null,
    } as never)

    const result = await saveAdminSessionWithAllocations({
      sessionId: 'session-1',
      startAt: '2026-06-01T15:00:00.000Z',
      endAt: '2026-06-01T16:00:00.000Z',
      status: 'scheduled',
      notes: null,
      weeklyTemplateId: null,
      isManualOverride: true,
      allocations: [{ distanceM: 10, targets: 2, slotCapacity: 8 }],
    })

    expect(result.session_id).toBe('session-1')
    expect(supabase.rpc).toHaveBeenCalledWith('admin_upsert_session_with_allocations', {
      p_session_id: 'session-1',
      p_start_at: '2026-06-01T15:00:00.000Z',
      p_end_at: '2026-06-01T16:00:00.000Z',
      p_status: 'scheduled',
      p_notes: null,
      p_weekly_template_id: null,
      p_is_manual_override: true,
      p_allocations: [{ distance_m: 10, targets: 2, slot_capacity: 8 }],
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('propagates RPC failures so PostgreSQL can roll back previous allocations', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'allocation insert failed' },
    } as never)

    await expect(
      saveAdminSessionWithAllocations({
        sessionId: 'session-1',
        startAt: '2026-06-01T15:00:00.000Z',
        endAt: '2026-06-01T16:00:00.000Z',
        status: 'scheduled',
        notes: null,
        weeklyTemplateId: null,
        isManualOverride: true,
        allocations: [{ distanceM: 10, targets: 2, slotCapacity: 8 }],
      }),
    ).rejects.toThrow('allocation insert failed')

    expect(supabase.from).not.toHaveBeenCalled()
  })
})
