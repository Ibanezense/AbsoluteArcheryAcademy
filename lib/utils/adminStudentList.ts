import dayjs from 'dayjs'
import type { StudentListRow } from '@/lib/queries/studentQueries'
import { norm } from '@/lib/utils/searchUtils'

export type AdminStudentStatus = 'active' | 'expiring' | 'paused' | 'inactive'
export type AdminStudentFilter = 'all' | AdminStudentStatus

const INACTIVE_STATUSES = new Set(['retired', 'withdrawn', 'blocked', 'suspended'])

export function getAdminStudentStatus(
  student: StudentListRow,
  now = new Date(),
): AdminStudentStatus {
  if (INACTIVE_STATUSES.has(student.effective_operational_status)) return 'inactive'

  if (
    student.effective_operational_status === 'paused' ||
    student.effective_operational_status === 'expired'
  ) {
    return 'paused'
  }

  if (student.membership_status === 'active' && student.membership_end) {
    const daysLeft = dayjs(student.membership_end)
      .startOf('day')
      .diff(dayjs(now).startOf('day'), 'day')

    if (daysLeft >= 0 && daysLeft <= 7) return 'expiring'
  }

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
