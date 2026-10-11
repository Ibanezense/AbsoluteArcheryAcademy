import type {
  StudentAttendanceReversalSummary,
  StudentClassExpirationSummary,
  StudentBookingSummary,
  StudentMembershipSummary,
  StudentWeeklyAttendanceSummary,
} from '@/lib/hooks/useStudentDetail'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'

const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

type MembershipIdentity = { id: string; membership_code?: string | null; start_date: string; end_date: string | null }

function formatCycleDate(value: string | null) {
  if (!value) return 'Sin fecha final'
  const [year, month, day] = value.split('-')
  const shortMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(day)} ${shortMonths[Number(month) - 1]} ${year}`
}

export function getAttendanceMembershipIdentity(membershipId: string | null | undefined, memberships: MembershipIdentity[]) {
  const membership = memberships.find((item) => item.id === membershipId)
  if (!membership) return { code: 'Por revisar', period: 'Sin membresía vinculada', needsReview: true }
  return {
    code: membership.membership_code || 'Código pendiente',
    period: `${formatCycleDate(membership.start_date)} – ${formatCycleDate(membership.end_date)}`,
    needsReview: false,
  }
}

export function attendanceForMembership<T extends { active_membership_id: string | null }>(rows: T[], membershipId: string): T[] {
  if (membershipId === 'all') return rows
  if (membershipId === 'unlinked') return rows.filter((row) => !row.active_membership_id)
  return rows.filter((row) => row.active_membership_id === membershipId)
}

export function formatAttendanceMembershipMonth(
  membershipId: string | null | undefined,
  memberships: Pick<StudentMembershipSummary, 'id' | 'start_date'>[],
) {
  const membership = memberships.find((item) => item.id === membershipId)
  const month = membership?.start_date?.slice(5, 7)
  const monthIndex = month ? Number(month) - 1 : -1

  return SPANISH_MONTHS[monthIndex] || 'Sin membresía'
}

export function buildStudentAttendanceHistory(
  bookings: StudentBookingSummary[],
  weeklyAttendance: StudentWeeklyAttendanceSummary[],
  reversals: StudentAttendanceReversalSummary[] = [],
  expirations: StudentClassExpirationSummary[] = [],
): StudentBookingSummary[] {
  const legacyWeeklyNote = 'Inasistencia semanal (jueves a domingo)'
  const reversedBookingIds = new Set(
    reversals.flatMap((reversal) => reversal.booking_id ? [reversal.booking_id] : []),
  )
  const reversedWeeklyIds = new Set(
    reversals.flatMap((reversal) => reversal.weekly_attendance_id ? [reversal.weekly_attendance_id] : []),
  )
  const bookingRows = bookings
    .filter((booking) => !reversedBookingIds.has(booking.id))
    .map((booking) => ({
      ...booking,
      source: booking.source || ('booking' as const),
      source_event_id: booking.source_event_id || booking.id,
    }))
  const weeklyRows: StudentBookingSummary[] = weeklyAttendance
    .filter((event) => !reversedWeeklyIds.has(event.id))
    .map((event) => ({
    id: `weekly-${event.id}`,
    session_id: '',
    active_membership_id: event.student_membership_id,
    status: event.status,
    distance_m: null,
    bow_usage_type: null,
    bow_poundage: null,
    admin_notes: event.note?.trim() || legacyWeeklyNote,
    start_at: event.week_end,
    end_at: null,
    source: 'weekly',
    source_event_id: event.id,
    occurrence_index: event.occurrence_index,
    note: event.note,
    }))

  const expiredRows: StudentBookingSummary[] = expirations.flatMap((event) =>
    Array.from({ length: event.normal_classes + event.recovery_classes }, (_, index) => ({
      id: `expiry-${event.id}-${index + 1}`,
      session_id: '',
      active_membership_id: event.student_membership_id,
      credit_kind: index < event.normal_classes ? 'normal' as const : 'recovery' as const,
      status: 'expired_unattended',
      distance_m: null,
      bow_usage_type: null,
      bow_poundage: null,
      admin_notes: 'No recuperable. Clase pendiente al finalizar el periodo de membresía.',
      // Show the last valid day of the cycle, not a fictitious session time.
      start_at: getLimaDateKey(new Date(new Date(event.expired_at).getTime() - 1000)),
      end_at: null,
      source: 'expiry' as const,
      source_event_id: event.id,
      occurrence_index: index + 1,
    })),
  )

  return [...bookingRows, ...weeklyRows, ...expiredRows].sort((left, right) => {
    const leftTime = left.start_at ? new Date(left.start_at).getTime() : 0
    const rightTime = right.start_at ? new Date(right.start_at).getTime() : 0
    const chronologicalOrder = rightTime - leftTime
    if (chronologicalOrder !== 0) return chronologicalOrder

    if (left.source === 'weekly' && right.source === 'weekly') {
      return (right.occurrence_index || 0) - (left.occurrence_index || 0)
    }

    return 0
  })
}
