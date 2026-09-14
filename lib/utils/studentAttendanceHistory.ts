import type {
  StudentBookingSummary,
  StudentWeeklyAttendanceSummary,
} from '@/lib/hooks/useStudentDetail'

export function buildStudentAttendanceHistory(
  bookings: StudentBookingSummary[],
  weeklyAttendance: StudentWeeklyAttendanceSummary[],
): StudentBookingSummary[] {
  const legacyWeeklyNote = 'Inasistencia semanal (jueves a domingo)'
  const bookingRows = bookings.map((booking) => ({
    ...booking,
    source: booking.source || ('booking' as const),
  }))
  const weeklyRows: StudentBookingSummary[] = weeklyAttendance.map((event) => ({
    id: `weekly-${event.id}`,
    session_id: '',
    active_membership_id: null,
    status: event.status,
    distance_m: null,
    bow_usage_type: null,
    bow_poundage: null,
    admin_notes: event.note?.trim() || legacyWeeklyNote,
    start_at: event.week_end,
    end_at: null,
    source: 'weekly',
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
