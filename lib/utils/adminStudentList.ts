import dayjs from 'dayjs'
import type { StudentListRow } from '@/lib/queries/studentQueries'
import { getLimaDateKey } from '@/lib/utils/membershipCycles'
import { norm } from '@/lib/utils/searchUtils'
import { getStudentOperationalStatus, type StudentOperationalStatus } from '@/lib/utils/studentOperationalStatus'

export type AdminStudentStatus = StudentOperationalStatus
export type AdminStudentFilter = 'all' | AdminStudentStatus
export type AdminStudentSort = 'status' | 'expiry' | 'name'

const UNCATEGORIZED = 'uncategorized'

function categoryKey(category: StudentListRow['category']) {
  return norm(category?.trim().replace(/\s+/g, ' ') || '') || UNCATEGORIZED
}

export function getAdminStudentCategories(students: StudentListRow[]) {
  const groups = new Map<string, { id: string; label: string; count: number }>()
  for (const student of students) {
    const id = categoryKey(student.category)
    const group = groups.get(id)
    if (group) group.count++
    else groups.set(id, { id, label: student.category?.trim() || 'Sin categoría', count: 1 })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
}

function matchesLocation(student: StudentListRow, locationId?: string) {
  if (!locationId) return true
  if (locationId === 'unassigned') return !student.home_location_id
  if (locationId === 'both') return student.home_location_id === 'both'
  return student.home_location_id === locationId || student.home_location_id === 'both'
}

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
  options: { locationId?: string; category?: string; sort?: AdminStudentSort } = {},
) {
  const needle = norm(query.trim())
  const phoneNeedle = /^[\d+().\s-]+$/.test(needle) ? needle.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '') : ''
  const today = options.sort === 'expiry' ? getLimaDateKey(now) : ''

  return students
    .filter((student) => {
      const matchesQuery = !needle || [student.full_name, student.dni || '', student.phone || '']
        .map((value) => norm(value))
        .some((value) => value.includes(needle))
        || Boolean(phoneNeedle && student.phone?.replace(/\D/g, '').includes(phoneNeedle))

      return matchesQuery
        && matchesLocation(student, options.locationId)
        && (!options.category || categoryKey(student.category) === options.category)
        && (filter === 'all' || getAdminStudentStatus(student, now) === filter)
    })
    .sort((left, right) => {
      if (options.sort === 'expiry') {
        const leftEnd = left.membership_coverage_end ?? (left.membership_coverage_end === undefined ? left.membership_end : null)
        const rightEnd = right.membership_coverage_end ?? (right.membership_coverage_end === undefined ? right.membership_end : null)
        if (leftEnd && !rightEnd) return -1
        if (rightEnd && !leftEnd) return 1
        if (leftEnd && rightEnd) {
          const overdueDifference = Number(leftEnd < today) - Number(rightEnd < today)
          const difference = overdueDifference || (leftEnd < today ? rightEnd.localeCompare(leftEnd) : leftEnd.localeCompare(rightEnd))
          if (difference) return difference
        }
      }
      if (options.sort === 'name' || options.sort === 'expiry') return left.full_name.localeCompare(right.full_name, 'es', { sensitivity: 'base' })
      const statusDifference =
        STATUS_PRIORITY[getAdminStudentStatus(left, now)] -
        STATUS_PRIORITY[getAdminStudentStatus(right, now)]

      if (statusDifference !== 0) return statusDifference
      return left.full_name.localeCompare(right.full_name, 'es', { sensitivity: 'base' })
    })
}
