import type {
  StudentAttendanceReversalSummary,
  StudentBookingSummary,
  StudentMembershipSummary,
  StudentWeeklyAttendanceSummary,
} from '@/lib/hooks/useStudentDetail'

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

  return [...bookingRows, ...weeklyRows].sort((left, right) => {
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
