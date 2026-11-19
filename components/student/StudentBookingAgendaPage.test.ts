// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { getBookingDayKey } from '@/lib/utils/bookingCutoff'
import StudentBookingAgendaPage from './StudentBookingAgendaPage'

const { rpc, confirm, push, invalidateQueries } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: { id: 'original-booking' }, error: null }),
  confirm: vi.fn().mockResolvedValue(true),
  push: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => confirm }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('@/components/student/MobileStudentHeader', () => ({ MobileStudentHeader: () => null }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('@/lib/hooks/useStudentContext', () => ({
  useStudentContext: () => ({ account: { role: 'student' }, activeStudentId: 'student', loading: false }),
}))
vi.mock('@/lib/hooks/useStudentDashboard', () => ({
  useStudentDashboard: () => ({ dashboard: null }),
  useStudentMembershipCoverageEnd: () => ({ data: null }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const session = {
      session_id: 'destination', status: 'scheduled', start_at: start, end_at: start,
      already_reserved: false, location_name: 'Tiabaya', bow_usage_type: 'own',
      can_book: false, eligibility_reason: 'no_balance',
    }
    const original = { status: 'reserved', start_at: start, booking_day_cutoff_at: null }
    const data = queryKey[0] === 'student-booking-agenda' ? [session]
      : queryKey[0] === 'student-booking-detail' ? original : { [getBookingDayKey(start)]: null }
    return { data, isLoading: false, isError: false, isPending: false }
  },
}))

it('lets a student move an already committed credit even if a new booking would lack balance', async () => {
  // Keep the test clock within a Lima calendar week.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T18:00:00Z'))
  try {
    render(createElement(StudentBookingAgendaPage, { moveBookingId: 'original-booking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a este turno' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/reserva/original-booking'))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('update_booking_session', {
      p_booking_id: 'original-booking', p_new_session_id: 'destination',
    })
  } finally {
    vi.useRealTimers()
  }
})
