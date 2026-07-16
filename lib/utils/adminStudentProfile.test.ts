import { describe, expect, it } from 'vitest'
import { buildPaymentDocumentRows, filterAttendance, selectPendingBookings, summarizeAttendance } from '@/lib/utils/adminStudentProfile'

const bookings = [
  { id: 'attended', status: 'attended', start_at: '2026-07-10T15:00:00-05:00' },
  { id: 'no-show', status: 'no_show', start_at: '2026-07-09T15:00:00-05:00' },
  { id: 'cancelled', status: 'cancelled', start_at: '2026-06-20T15:00:00-05:00' },
  { id: 'reserved', status: 'reserved', start_at: '2026-07-20T15:00:00-05:00' },
] as any[]

describe('student profile selectors', () => {
  it('summarizes attendance outcomes', () => {
    expect(summarizeAttendance(bookings)).toEqual({ attended: 1, noShow: 1, cancelled: 1 })
  })

  it('filters attendance by outcome and inclusive dates', () => {
    expect(filterAttendance(bookings, 'all', '2026-07-01', '2026-07-31').map((row) => row.id)).toEqual(['attended', 'no-show'])
    expect(filterAttendance(bookings, 'no_show').map((row) => row.id)).toEqual(['no-show'])
  })

  it('returns only pending reservations', () => {
    expect(selectPendingBookings(bookings).map((row) => row.id)).toEqual(['reserved'])
  })

  it('derives internal payment records without inventing fiscal numbers', () => {
    const rows = buildPaymentDocumentRows([{ id: 'abcdef12-0000', paid_at: '2026-07-10T15:00:00-05:00', payment_status: 'paid' }] as any)
    expect(rows).toEqual([{ id: 'abcdef12-0000', reference: 'Pago ABCDEF12', date: '2026-07-10T15:00:00-05:00', status: 'paid' }])
  })
})
