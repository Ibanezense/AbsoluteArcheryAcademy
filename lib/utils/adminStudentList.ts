import dayjs from 'dayjs'
import type { StudentListRow } from '@/lib/queries/studentQueries'
import { norm } from '@/lib/utils/searchUtils'

export type AdminStudentStatus = 'active' | 'expiring' | 'expired' | 'paused' | 'inactive'
export type AdminStudentFilter = 'all' | AdminStudentStatus

const INACTIVE_STATUSES = new Set(['inactive', 'retired', 'withdrawn', 'blocked', 'suspended'])

function expirationDay(student: StudentListRow) {
  if (student.membership_expired_at) {
    const expiredAt = dayjs(student.membership_expired_at)
    if (expiredAt.isValid()) return expiredAt.startOf('day')
  }

  if (student.membership_end) {
    const endDate = dayjs(student.membership_end)
    if (endDate.isValid()) return endDate.add(1, 'day').startOf('day')
  }

  return null
}

export function getAdminStudentStatus(
  student: StudentListRow,
  now = new Date(),
): AdminStudentStatus {
  if (INACTIVE_STATUSES.has(student.effective_operational_status)) return 'inactive'

  const today = dayjs(now).startOf('day')
  const daysLeft = student.membership_end
    ? dayjs(student.membership_end).startOf('day').diff(today, 'day')
    : null
  const hasActiveMembership =
    student.membership_status === 'active' &&
    student.membership_raw_classes_remaining > 0 &&
    (daysLeft == null || daysLeft >= 0)

  if (hasActiveMembership) {
    if (daysLeft != null && daysLeft <= 7) return 'expiring'
    return 'active'
  }

  const expiredAt = expirationDay(student)
  if (expiredAt) {
    const daysSinceExpiration = Math.max(today.diff(expiredAt, 'day'), 0)
    if (daysSinceExpiration >= 61) return 'inactive'
    if (daysSinceExpiration >= 15) return 'paused'
    return 'expired'
  }

  const hasMembership = Boolean(
    student.membership_name ||
    student.membership_status ||
    student.membership_end ||
    student.membership_expired_at
  )

  if (
    student.membership_status === 'expired' ||
    (hasMembership && student.membership_raw_classes_remaining <= 0) ||
    student.effective_operational_status === 'expired'
  ) return 'expired'

  if (student.effective_operational_status === 'paused') return 'paused'

  return 'active'
}

export function filterAdminStudents(
  students: StudentListRow[],
  query: string,
  filter: AdminStudentFilter,
) {
  const needle = norm(query)

  return students.filter((student) => {
    const matchesQuery = !needle || [student.full_name, student.dni || '', student.phone || '']
      .map((value) => norm(value))
      .some((value) => value.includes(needle))

    return matchesQuery && (filter === 'all' || getAdminStudentStatus(student) === filter)
  })
}
