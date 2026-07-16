import { describe, expect, it } from 'vitest'
import { filterAdminStudents, getAdminStudentStatus } from '@/lib/utils/adminStudentList'

const baseStudent = {
  id: 'student-1',
  full_name: 'Ana Torres',
  dni: '12345678',
  phone: '999111222',
  email: null,
  membership_end: '2026-07-30',
  membership_expired_at: null,
  membership_status: 'active',
  membership_raw_classes_remaining: 8,
  classes_remaining: 8,
  effective_operational_status: 'active',
} as any

const now = new Date('2026-07-15T12:00:00-05:00')

function expiredStudent(daysSinceExpiration: number, fullName = 'Ana Torres') {
  const expiredAt = new Date(now)
  expiredAt.setDate(expiredAt.getDate() - daysSinceExpiration)

  return {
    ...baseStudent,
    full_name: fullName,
    membership_status: 'expired',
    membership_raw_classes_remaining: 0,
    classes_remaining: 0,
    membership_expired_at: expiredAt.toISOString(),
    effective_operational_status: daysSinceExpiration >= 15 ? 'paused' : 'expired',
  }
}

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

  it('keeps a manually paused student paused when no expiration timestamp is available', () => {
    expect(getAdminStudentStatus({
      ...baseStudent,
      membership_name: null,
      membership_end: null,
      membership_status: null,
      membership_raw_classes_remaining: 0,
      classes_remaining: 0,
      effective_operational_status: 'paused',
    })).toBe('paused')
  })

  it('keeps a healthy active membership active', () => {
    expect(
      getAdminStudentStatus(baseStudent, new Date('2026-07-15T12:00:00-05:00')),
    ).toBe('active')
  })

  it.each([
    [14, 'expired'],
    [15, 'paused'],
    [60, 'paused'],
    [61, 'inactive'],
  ] as const)('marks day %s after membership expiration as %s', (days, expected) => {
    expect(getAdminStudentStatus(expiredStudent(days), now)).toBe(expected)
  })

  it('marks an active membership with no raw classes as expired', () => {
    expect(
      getAdminStudentStatus({
        ...baseStudent,
        membership_raw_classes_remaining: 0,
        classes_remaining: 0,
        membership_expired_at: now.toISOString(),
      }, now),
    ).toBe('expired')
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

  it('orders students by status priority and then by name', () => {
    const students = [
      expiredStudent(61, 'Inactivo'),
      { ...baseStudent, full_name: 'Activo Z' },
      expiredStudent(15, 'En pausa'),
      {
        ...baseStudent,
        full_name: 'Por vencer',
        membership_end: '2026-07-20',
      },
      expiredStudent(3, 'Vencido'),
      { ...baseStudent, full_name: 'Activo A' },
    ]

    expect(filterAdminStudents(students, '', 'all', now).map((student) => student.full_name)).toEqual([
      'Activo A',
      'Activo Z',
      'Por vencer',
      'Vencido',
      'En pausa',
      'Inactivo',
    ])
  })
})
