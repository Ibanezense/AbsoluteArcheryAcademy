import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntroClassesService } from './IntroClassesService'
import { supabase } from '@/lib/supabaseClient'
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())
describe('intro calendar persistence contract', () => {
  it('queries the requested week rather than a future-only horizon', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    await expect(IntroClassesService.getCalendar('2026-09-28', '2026-10-04', 'umacollo')).resolves.toEqual([])
    expect(supabase.rpc).toHaveBeenCalledWith('admin_get_intro_calendar', { p_date_from: '2026-09-28', p_date_to: '2026-10-04', p_location_id: 'umacollo' })
  })
  it('propagates a concurrent-edit conflict without reporting success', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'La cita cambió. Actualiza el calendario.' } } as never)
    await expect(IntroClassesService.changeAppointment({ bookingId: 'b', expectedUpdatedAt: 'version', action: 'move', sessionId: 'target' })).rejects.toThrow('La cita cambió')
    expect(supabase.rpc).toHaveBeenCalledWith('admin_change_intro_appointment', expect.objectContaining({ p_booking_id: 'b', p_expected_updated_at: 'version', p_action: 'move', p_session_id: 'target' }))
  })
  it('registers the on-site payment intent in the same transaction', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { success: true }, error: null } as never)
    await IntroClassesService.registerAppointment({ fullName: 'Laura', age: 25, sessionId: 's', amountPaid: 45, paymentMethod: 'not_applicable', introClassType: 'paid', paymentStatus: 'pending', payOnSite: true, requestId: 'request' })
    expect(supabase.rpc).toHaveBeenCalledWith('admin_register_intro_appointment', expect.objectContaining({ p_pay_on_site: true, p_payment_status: 'pending', p_request_id: 'request' }))
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
