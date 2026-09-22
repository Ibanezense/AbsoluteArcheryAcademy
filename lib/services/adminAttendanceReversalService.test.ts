import { describe, expect, it, vi } from 'vitest'
import { reverseStudentNoShow } from './adminAttendanceReversalService'

function rpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe('admin attendance reversal service', () => {
  it.each(['booking', 'weekly'] as const)(
    'reverses a %s no-show through the idempotent RPC',
    async (source) => {
      const client = rpcClient({
        data: {
          success: true,
          already_reversed: false,
          reversal_id: 'reversal-1',
          membership_id: 'membership-1',
          classes_remaining: 3,
        },
        error: null,
      })

      const result = await reverseStudentNoShow(client, {
        source,
        eventId: `${source}-1`,
        reason: 'Justificada por enfermedad',
        requestId: 'request-1',
      })

      expect(client.rpc).toHaveBeenCalledWith('admin_reverse_no_show', {
        p_source: source,
        p_event_id: `${source}-1`,
        p_reason: 'Justificada por enfermedad',
        p_request_id: 'request-1',
      })
      expect(result).toMatchObject({
        success: true,
        already_reversed: false,
        membership_id: 'membership-1',
        classes_remaining: 3,
      })
    },
  )

  it('propagates database errors', async () => {
    const client = rpcClient({ data: null, error: { message: 'No autorizado' } })

    await expect(reverseStudentNoShow(client, {
      source: 'booking',
      eventId: 'booking-1',
      reason: 'Justificada',
      requestId: 'request-2',
    })).rejects.toThrow('No autorizado')
  })

  it('rejects unsuccessful business responses', async () => {
    const client = rpcClient({
      data: { success: false, error: 'La inasistencia ya fue revertida' },
      error: null,
    })

    await expect(reverseStudentNoShow(client, {
      source: 'weekly',
      eventId: 'weekly-1',
      reason: 'Justificada',
      requestId: 'request-3',
    })).rejects.toThrow('La inasistencia ya fue revertida')
  })
})
