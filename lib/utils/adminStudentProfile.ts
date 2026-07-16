import dayjs from 'dayjs'
import type { StudentBookingSummary, StudentPaymentSummary } from '@/lib/hooks/useStudentDetail'

export type AttendanceFilter = 'all' | 'attended' | 'no_show' | 'cancelled'
export type StudentBowUsageType = 'own' | 'assigned' | 'academy'

const ATTENDANCE_STATUSES = new Set(['attended', 'no_show', 'cancelled'])

export function getBowFlags(type: StudentBowUsageType) {
  return {
    hasOwnBow: type === 'own',
    assignedBow: type === 'assigned',
  }
}

export function getStudentBowUsage({
  hasOwnBow,
  assignedBow,
  bowPoundage,
}: {
  hasOwnBow: boolean
  assignedBow: boolean
  bowPoundage: number | null
}) {
  const type: StudentBowUsageType = hasOwnBow ? 'own' : assignedBow ? 'assigned' : 'academy'
  const labels: Record<StudentBowUsageType, string> = {
    own: 'Arco propio',
    assigned: 'Arco asignado',
    academy: 'Arco de academia',
  }

  return {
    type,
    label: bowPoundage ? `${labels[type]} · ${bowPoundage} lb` : labels[type],
  }
}

export function getMembershipDisplayFields(membership: {
  id: string
  document_number: string | null
  payment_type: string | null
  billing_date: string | null
  discount_type: string | null
  discount_value: number | null
  frozen_at: string | null
}) {
  const paymentLabels: Record<string, string> = {
    manual: 'Manual',
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    yape: 'Yape',
    plin: 'Plin',
  }
  const discountValue = membership.discount_value || 0
  const discountLabel = membership.discount_type === 'percentage' && discountValue > 0
    ? `${discountValue}%`
    : membership.discount_type === 'amount' && discountValue > 0
      ? `PEN ${discountValue.toFixed(2)}`
      : 'Sin descuento'

  return {
    documentNumber: membership.document_number || `MEM-${membership.id.slice(0, 8).toUpperCase()}`,
    paymentType: paymentLabels[membership.payment_type || 'manual'] || membership.payment_type || 'Manual',
    billingDate: membership.billing_date,
    discountLabel,
    frozen: Boolean(membership.frozen_at),
  }
}

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
