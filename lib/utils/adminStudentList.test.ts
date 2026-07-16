import { describe, expect, it } from 'vitest'
import { filterAdminStudents, getAdminStudentStatus } from '@/lib/utils/adminStudentList'

const baseStudent = {
  id: 'student-1',
  full_name: 'Ana Torres',
  dni: '12345678',
  phone: '999111222',
  email: null,
  membership_end: '2026-07-30',
  membership_status: 'active',
  effective_operational_status: 'active',
} as any

describe('getAdminStudentStatus', () => {
  it('marks an active membership ending within seven days as expiring', () => {
    expect(
      getAdminStudentStatus(
        { ...baseStudent, membership_end: '2026-07-20' },
        new Date('2026-07-15T12:00:00-05:00'),
      ),
    ).toBe('expiring')
  })

  it.each(['retired', 'withdrawn', 'blocked', 'suspended'])('groups %s as inactive', (status) => {
    expect(getAdminStudentStatus({ ...baseStudent, effective_operational_status: status })).toBe('inactive')
  })

  it.each(['paused', 'expired'])('groups %s as paused', (status) => {
    expect(getAdminStudentStatus({ ...baseStudent, effective_operational_status: status })).toBe('paused')
  })

  it('keeps a healthy active membership active', () => {
    expect(
      getAdminStudentStatus(baseStudent, new Date('2026-07-15T12:00:00-05:00')),
    ).toBe('active')
  })
})

describe('filterAdminStudents', () => {
  it.each(['ana', '12345678', '999111222'])('matches the search value %s', (query) => {
    expect(filterAdminStudents([baseStudent], query, 'all')).toHaveLength(1)
  })

  it('normalizes accents while searching names', () => {
    expect(
      filterAdminStudents([{ ...baseStudent, full_name: 'Ángela Núñez' }], 'angela nunez', 'all'),
    ).toHaveLength(1)
  })

  it('filters by the visible status', () => {
    expect(filterAdminStudents([baseStudent], '', 'active')).toHaveLength(1)
    expect(filterAdminStudents([baseStudent], '', 'inactive')).toHaveLength(0)
  })
})
