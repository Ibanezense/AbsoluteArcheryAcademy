import dayjs from 'dayjs'
import type { StudentListRow } from '@/lib/queries/studentQueries'
import { norm } from '@/lib/utils/searchUtils'
import { getStudentOperationalStatus, type StudentOperationalStatus } from '@/lib/utils/studentOperationalStatus'

export type AdminStudentStatus = StudentOperationalStatus
export type AdminStudentFilter = 'all' | AdminStudentStatus
export type AdminStudentSort = 'status' | 'expiry' | 'name'

const STATUS_PRIORITY: Record<AdminStudentStatus, number> = {
  active: 0,
  expiring: 1,
  expired: 2,
  paused: 3,
  inactive: 4,
}

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
  const hasMembership = Boolean(
    student.membership_name ||
    student.membership_status ||
    student.membership_end ||
    student.membership_expired_at
  )

  return getStudentOperationalStatus({
    membershipStatus: student.membership_status,
    classesRemaining: student.membership_raw_classes_remaining,
    membershipEnd: student.membership_end,
    membershipExpiredAt: expirationDay(student)?.toISOString() || null,
    effectiveStatus: student.effective_operational_status,
    hasMembership,
  }, now)
}

export function filterAdminStudents(
  students: StudentListRow[],
  query: string,
  filter: AdminStudentFilter,
  now = new Date(),
  options: { locationId?: string; sort?: AdminStudentSort } = {},
) {
  const needle = norm(query)

  return students
    .filter((student) => {
      const matchesQuery = !needle || [student.full_name, student.dni || '', student.phone || '']
        .map((value) => norm(value))
        .some((value) => value.includes(needle))

      return matchesQuery
        && (!options.locationId || student.home_location_id === options.locationId)
        && (filter === 'all' || getAdminStudentStatus(student, now) === filter)
    })
    .sort((left, right) => {
      if (options.sort === 'expiry') {
        const leftEnd = left.membership_end && dayjs(left.membership_end).isValid() ? left.membership_end : '9999-12-31'
        const rightEnd = right.membership_end && dayjs(right.membership_end).isValid() ? right.membership_end : '9999-12-31'
        const difference = leftEnd.localeCompare(rightEnd)
        if (difference) return difference
      }
      if (options.sort === 'name' || options.sort === 'expiry') return left.full_name.localeCompare(right.full_name, 'es', { sensitivity: 'base' })
      const statusDifference =
        STATUS_PRIORITY[getAdminStudentStatus(left, now)] -
        STATUS_PRIORITY[getAdminStudentStatus(right, now)]

      if (statusDifference !== 0) return statusDifference
      return left.full_name.localeCompare(right.full_name, 'es', { sensitivity: 'base' })
    })
}
