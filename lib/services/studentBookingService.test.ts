import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc } }))
import { fetchStudentBookingAgenda, fetchStudentBookingDetail } from './studentBookingService'

describe('student booking reads', () => {
  beforeEach(() => rpc.mockReset())
  it('uses date-specific server eligibility and never the write RPC', async () => {
    const session = { session_id: 'turn', can_book: false, eligibility_reason: 'membership_dates' }
    rpc.mockResolvedValue({ data: [session], error: null })
    expect(await fetchStudentBookingAgenda('student', '2026-10-26', '2026-11-01')).toEqual([session])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_student_booking_agenda', { p_student_id: 'student', p_date_from: '2026-10-26', p_date_to: '2026-11-01' })
  })
  it('does not fall back to misleading cupos when eligibility cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('network') })
    await expect(fetchStudentBookingAgenda('student', '2026-10-26', '2026-11-01')).rejects.toThrow('network')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('separates missing bookings from service failures', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: new Error('denied') })
    expect(await fetchStudentBookingDetail('00000000-0000-0000-0000-000000000001', 'student')).toBeNull()
    await expect(fetchStudentBookingDetail('00000000-0000-0000-0000-000000000001', 'student')).rejects.toThrow('denied')
  })
  it('reads detail in the selected academic student context', async () => {
    const detail = { booking_id: 'booking', location_name: 'Tiabaya', cancellation_source: 'day_end' }
    rpc.mockResolvedValue({ data: [detail], error: null })
    expect(await fetchStudentBookingDetail('00000000-0000-0000-0000-000000000001', 'student')).toEqual(detail)
    expect(rpc).toHaveBeenCalledWith('get_student_booking_detail', { p_booking_id: '00000000-0000-0000-0000-000000000001', p_student_id: 'student' })
  })
})
