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
