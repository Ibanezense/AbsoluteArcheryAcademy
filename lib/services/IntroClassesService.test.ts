import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntroClassesService } from './IntroClassesService'
import { supabase } from '@/lib/supabaseClient'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

describe('IntroClassesService.registerIntroClass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('uses the atomic intro registration RPC instead of partial table writes', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await expect(
      IntroClassesService.registerIntroClass({
        fullName: 'Laura Torres',
        age: 25,
        phone: '999888777',
        sessionId: 'session-1',
        amountPaid: 45,
        paymentMethod: 'yape',
      }),
    ).resolves.toBe(true)

    expect(supabase.rpc).toHaveBeenCalledWith('admin_register_intro_class', {
      p_full_name: 'Laura Torres',
      p_age: 25,
      p_phone: '999888777',
      p_session_id: 'session-1',
      p_amount_paid: 45,
      p_payment_method: 'yape',
      p_intro_class_type: 'paid',
      p_payment_status: 'paid',
      p_courtesy_reason: null,
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('sends free intro class metadata without a payable amount', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await expect(
      IntroClassesService.registerIntroClass({
        fullName: 'Mateo Ruiz',
        age: 13,
        phone: '988776655',
        sessionId: 'session-2',
        amountPaid: 0,
        paymentMethod: 'not_applicable',
        introClassType: 'free',
        paymentStatus: 'not_applicable',
      }),
    ).resolves.toBe(true)

    expect(supabase.rpc).toHaveBeenCalledWith('admin_register_intro_class', {
      p_full_name: 'Mateo Ruiz',
      p_age: 13,
      p_phone: '988776655',
      p_session_id: 'session-2',
      p_amount_paid: 0,
      p_payment_method: 'not_applicable',
      p_intro_class_type: 'free',
      p_payment_status: 'not_applicable',
      p_courtesy_reason: null,
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('sends courtesy intro class metadata with the required reason', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await expect(
      IntroClassesService.registerIntroClass({
        fullName: 'Sofia Vega',
        age: 18,
        phone: '977665544',
        sessionId: 'session-3',
        amountPaid: 0,
        paymentMethod: 'not_applicable',
        introClassType: 'courtesy',
        paymentStatus: 'not_applicable',
        courtesyReason: 'Invitacion institucional',
      }),
    ).resolves.toBe(true)

    expect(supabase.rpc).toHaveBeenCalledWith('admin_register_intro_class', {
      p_full_name: 'Sofia Vega',
      p_age: 18,
      p_phone: '977665544',
      p_session_id: 'session-3',
      p_amount_paid: 0,
      p_payment_method: 'not_applicable',
      p_intro_class_type: 'courtesy',
      p_payment_status: 'not_applicable',
      p_courtesy_reason: 'Invitacion institucional',
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('propagates RPC failures so PostgreSQL can roll back the full intro registration', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'payment insert failed' },
    } as never)

    await expect(
      IntroClassesService.registerIntroClass({
        fullName: 'Laura Torres',
        age: 25,
        sessionId: 'session-1',
        amountPaid: 45,
        paymentMethod: 'yape',
      }),
    ).rejects.toThrow('payment insert failed')

    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('IntroClassesService.updateIntroClass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('uses the atomic admin edit RPC for prospect, payment and schedule changes', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await expect(
      IntroClassesService.updateIntroClass({
        bookingId: 'booking-1',
        introClientId: 'intro-1',
        fullName: 'Laura Torres Actualizada',
        age: 26,
        phone: '999111222',
        sessionId: 'session-2',
        amountPaid: 45,
        paymentMethod: 'yape',
        introClassType: 'paid',
        paymentStatus: 'paid',
        courtesyReason: null,
      }),
    ).resolves.toBe(true)

    expect(supabase.rpc).toHaveBeenCalledWith('admin_update_intro_class', {
      p_booking_id: 'booking-1',
      p_intro_client_id: 'intro-1',
      p_full_name: 'Laura Torres Actualizada',
      p_age: 26,
      p_phone: '999111222',
      p_session_id: 'session-2',
      p_amount_paid: 45,
      p_payment_method: 'yape',
      p_intro_class_type: 'paid',
      p_payment_status: 'paid',
      p_courtesy_reason: null,
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('IntroClassesService.getAvailableSessions', () => {
  it('looks ahead roughly one month by default so admin can book intro classes beyond the next week', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'session-1',
          start_at: '2026-06-14T16:00:00.000Z',
          end_at: '2026-06-14T17:30:00.000Z',
          session_distance_allocations: [{ distance_m: 10, slot_capacity: 12, targets: 3 }],
        },
      ],
      error: null,
    })
    const lte = vi.fn(() => ({ order }))
    const gte = vi.fn(() => ({ lte }))
    const eqDistance = vi.fn(() => ({ gte }))
    const eqStatus = vi.fn(() => ({ eq: eqDistance }))
    const selectSessions = vi.fn(() => ({ eq: eqStatus }))
    const bookingsIn = vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }))
    const selectBookings = vi.fn(() => ({ in: bookingsIn }))

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'sessions') {
        return { select: selectSessions } as never
      }

      if (table === 'bookings') {
        return { select: selectBookings } as never
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    await IntroClassesService.getAvailableSessions()

    expect(lte).toHaveBeenCalledTimes(1)
    const firstCall = lte.mock.calls.at(0) as [string, string] | undefined
    const upperBound = firstCall?.[1]
    const diffMs = new Date(String(upperBound)).getTime() - Date.now()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(32)
  })
})
