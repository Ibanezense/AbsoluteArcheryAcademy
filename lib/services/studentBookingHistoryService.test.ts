import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }))
import { fetchStudentBookingHistory } from './studentBookingHistoryService'
beforeEach(() => vi.clearAllMocks())
it('filters on the server before requesting a bounded page and preserves full totals', async () => {
  const result = { rows: [], total: 36, page: 2, pageSize: 10, summary: { upcoming: 2, history: 76, attended: 66, currentCancelled: 2, currentNoShow: 0, currentMembershipId: 'plan' } }
  mocks.rpc.mockResolvedValue({ data: result, error: null })
  expect(await fetchStudentBookingHistory('student', { scope: 'history', month: '2026-09', status: 'attended', page: 2 })).toEqual(result)
  expect(mocks.rpc).toHaveBeenCalledWith('student_get_booking_history', { p_student_id: 'student', p_scope: 'history', p_month: '2026-09-01', p_status: 'attended', p_page: 2, p_page_size: 10 })
})
it('does not disguise missing summary or an access failure as empty history', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('Sin acceso') })
  await expect(fetchStudentBookingHistory('student')).rejects.toThrow('Sin acceso')
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  await expect(fetchStudentBookingHistory('student')).rejects.toThrow('historial completo')
})
