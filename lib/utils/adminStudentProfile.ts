import dayjs from 'dayjs'
import type { StudentBookingSummary, StudentPaymentSummary } from '@/lib/hooks/useStudentDetail'

export type AttendanceFilter = 'all' | 'attended' | 'no_show' | 'cancelled'

const ATTENDANCE_STATUSES = new Set(['attended', 'no_show', 'cancelled'])

export function summarizeAttendance(bookings: StudentBookingSummary[]) {
  return bookings.reduce((summary, booking) => {
    if (booking.status === 'attended') summary.attended += 1
    if (booking.status === 'no_show') summary.noShow += 1
    if (booking.status === 'cancelled') summary.cancelled += 1
    return summary
  }, { attended: 0, noShow: 0, cancelled: 0 })
}

export function filterAttendance(
  bookings: StudentBookingSummary[],
  filter: AttendanceFilter,
  from?: string,
  to?: string,
) {
  const fromDate = from ? dayjs(from).startOf('day') : null
  const toDate = to ? dayjs(to).endOf('day') : null

  return bookings.filter((booking) => {
    if (!ATTENDANCE_STATUSES.has(booking.status)) return false
    if (filter !== 'all' && booking.status !== filter) return false
    const date = booking.start_at ? dayjs(booking.start_at) : null
    if (fromDate && (!date?.isValid() || date.isBefore(fromDate))) return false
    if (toDate && (!date?.isValid() || date.isAfter(toDate))) return false
    return true
  })
}

export function selectPendingBookings(bookings: StudentBookingSummary[]) {
  return bookings.filter((booking) => booking.status === 'reserved')
}

export function buildPaymentDocumentRows(payments: StudentPaymentSummary[]) {
  return payments.map((payment) => ({
    id: payment.id,
    reference: `Pago ${payment.id.slice(0, 8).toUpperCase()}`,
    date: payment.paid_at,
    status: payment.payment_status,
  }))
}
