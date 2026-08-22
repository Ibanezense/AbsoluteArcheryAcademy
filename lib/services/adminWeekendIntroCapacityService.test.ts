import { describe, expect, it, vi } from 'vitest'
import { fetchAdminWeekendIntroCapacity } from '@/lib/services/adminWeekendIntroCapacityService'

function rpcClient(result: {
  data: unknown
  error: { message?: string } | null
}) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

const validRow = {
  session_id: 'session-1',
  start_at: '2026-08-22T14:00:00+00:00',
  end_at: '2026-08-22T15:00:00+00:00',
  equipment_capacity: 8,
  equipment_reserved: 3,
  spots_remaining: 5,
  academy_capacity: 6,
  academy_bows_used: 2,
  intro_bows_capacity: 2,
  intro_bows_used: 1,
}

describe('fetchAdminWeekendIntroCapacity', () => {
  it('calls the capacity RPC with the exact reference-date payload and maps its rows', async () => {
    const client = rpcClient({ data: [validRow], error: null })

    const result = await fetchAdminWeekendIntroCapacity(client, '2026-08-21')

    expect(client.rpc).toHaveBeenCalledWith('admin_get_weekend_intro_capacity', {
      p_reference_date: '2026-08-21',
    })
    expect(result).toEqual([{
      sessionId: validRow.session_id,
      startAt: validRow.start_at,
      endAt: validRow.end_at,
      equipmentCapacity: 8,
      equipmentReserved: 3,
      spotsRemaining: 5,
      academyCapacity: 6,
      academyBowsUsed: 2,
      introBowsCapacity: 2,
      introBowsUsed: 1,
    }])
  })

  it('normalizes a null RPC result to an empty list', async () => {
    const client = rpcClient({ data: null, error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .resolves.toEqual([])
  })

  it('rejects a non-array RPC result', async () => {
    const client = rpcClient({ data: validRow, error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('formato')
  })

  it('wraps backend errors with useful Spanish operation context', async () => {
    const rpcErrorClient = rpcClient({
      data: null,
      error: { message: 'permission denied for function' },
    })
    const fallbackClient = rpcClient({ data: null, error: {} })

    await expect(fetchAdminWeekendIntroCapacity(rpcErrorClient, '2026-08-21'))
      .rejects.toThrow(
        'No se pudo cargar la disponibilidad del fin de semana: permission denied for function',
      )
    await expect(fetchAdminWeekendIntroCapacity(fallbackClient, '2026-08-21'))
      .rejects.toThrow('No se pudo cargar la disponibilidad del fin de semana.')
  })

  it.each([
    ['negative capacity', { equipment_capacity: -1 }],
    ['fractional capacity', { equipment_capacity: 7.5 }],
    ['negative reserved count', { equipment_reserved: -1 }],
    ['fractional reserved count', { equipment_reserved: 1.5 }],
    ['negative remaining count', { spots_remaining: -1 }],
    ['fractional remaining count', { spots_remaining: 1.5 }],
    ['non-finite remaining count', { spots_remaining: Number.POSITIVE_INFINITY }],
  ])('rejects a row with %s', async (_label, override) => {
    const client = rpcClient({ data: [{ ...validRow, ...override }], error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it.each([
    ['empty ID', { session_id: '' }],
    ['whitespace-only ID', { session_id: '   ' }],
    ['non-string ID', { session_id: 42 }],
    ['invalid start date', { start_at: 'not-a-date' }],
    ['empty end date', { end_at: '' }],
  ])('rejects a row with an %s', async (_label, override) => {
    const client = rpcClient({ data: [{ ...validRow, ...override }], error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it.each([
    ['numeric-looking input', { start_at: '0' }],
    ['locale-formatted input', { start_at: '12/25/2026' }],
    ['impossible calendar date', { start_at: '2026-02-31T14:00:00Z' }],
  ])('rejects a non-RFC3339 timestamp: %s', async (_label, override) => {
    const client = rpcClient({ data: [{ ...validRow, ...override }], error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it.each([
    ['equal timestamps', '2026-08-22T14:00:00+00:00'],
    ['a reversed interval', '2026-08-22T13:59:59+00:00'],
  ])('rejects %s', async (_label, endAt) => {
    const client = rpcClient({ data: [{ ...validRow, end_at: endAt }], error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it('accepts Z and offset timestamps with optional fractional seconds', async () => {
    const client = rpcClient({
      data: [
        {
          ...validRow,
          start_at: '2026-08-22T14:00:00Z',
          end_at: '2026-08-22T15:00:00.123Z',
        },
        {
          ...validRow,
          session_id: 'session-2',
          start_at: '2026-08-22T09:00:00.123-05:00',
          end_at: '2026-08-22T10:00:00-05:00',
        },
      ],
      error: null,
    })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .resolves.toHaveLength(2)
  })

  it('rejects remaining spots greater than equipment capacity', async () => {
    const client = rpcClient({
      data: [{ ...validRow, equipment_capacity: 4, spots_remaining: 5 }],
      error: null,
    })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it('allows forced overbooking when remaining capacity is safely clamped', async () => {
    const client = rpcClient({
      data: [{
        ...validRow,
        equipment_capacity: 8,
        equipment_reserved: 10,
        spots_remaining: 0,
      }],
      error: null,
    })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .resolves.toEqual([expect.objectContaining({
        equipmentCapacity: 8,
        equipmentReserved: 10,
        spotsRemaining: 0,
      })])
  })

  it('fails the whole query when any row is inconsistent', async () => {
    const client = rpcClient({
      data: [validRow, { ...validRow, session_id: null }],
      error: null,
    })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it.each([
    ['negative academy capacity', { academy_capacity: -1 }],
    ['fractional academy usage', { academy_bows_used: 1.5 }],
    ['wrong intro capacity', { intro_bows_capacity: 3 }],
    ['intro usage above capacity', { intro_bows_used: 3 }],
  ])('rejects an invalid bow breakdown: %s', async (_label, override) => {
    const client = rpcClient({ data: [{ ...validRow, ...override }], error: null })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .rejects.toThrow('inválida')
  })

  it('allows forced overbooking in the 20 lb academy inventory', async () => {
    const client = rpcClient({
      data: [{ ...validRow, academy_capacity: 6, academy_bows_used: 7 }],
      error: null,
    })

    await expect(fetchAdminWeekendIntroCapacity(client, '2026-08-21'))
      .resolves.toEqual([expect.objectContaining({ academyCapacity: 6, academyBowsUsed: 7 })])
  })
})
