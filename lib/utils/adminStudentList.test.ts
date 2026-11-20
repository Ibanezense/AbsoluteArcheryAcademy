import { describe, expect, it } from 'vitest'
import { filterAdminStudents, getAdminStudentStatus, getAdminStudentCategories } from '@/lib/utils/adminStudentList'

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
  it('includes dual-site students at either site and can isolate unassigned students', () => {
    const students = [
      { ...baseStudent, id: 'both', home_location_id: 'both' },
      { ...baseStudent, id: 'none', home_location_id: null },
    ]
    expect(filterAdminStudents(students, '', 'all', now, { locationId: 'tiabaya' }).map(row => row.id)).toEqual(['both'])
    expect(filterAdminStudents(students, '', 'all', now, { locationId: 'umacollo' }).map(row => row.id)).toEqual(['both'])
    expect(filterAdminStudents(students, '', 'all', now, { locationId: 'unassigned' }).map(row => row.id)).toEqual(['none'])
  })

  it('counts and filters matching categories consistently, including uncategorized students', () => {
    const students = [
      { ...baseStudent, id: 'one', category: 'Recurvo U18 damas' },
      { ...baseStudent, id: 'two', category: ' recurvo U18 damas ' },
      { ...baseStudent, id: 'three', category: null },
    ]
    expect(getAdminStudentCategories(students).map(option => option.count)).toEqual([2, 1])
    expect(filterAdminStudents(students, '', 'all', now, { category: 'recurvo u18 damas' })).toHaveLength(2)
    expect(filterAdminStudents(students, '', 'all', now, { category: 'uncategorized' }).map(row => row.id)).toEqual(['three'])
  })

  it('orders by full coverage end with upcoming dates ahead of overdue dates', () => {
    const students = [
      { ...baseStudent, id: 'overdue', membership_end: '2026-07-14' },
      { ...baseStudent, id: 'extended', membership_end: '2026-07-16', membership_coverage_end: '2026-08-15' },
      { ...baseStudent, id: 'upcoming', membership_end: '2026-07-20' },
    ]
    expect(filterAdminStudents(students, '', 'all', now, { sort: 'expiry' }).map(row => row.id)).toEqual(['upcoming', 'extended', 'overdue'])
  })

  it('combines search, status and site without requiring phone or avatar', () => {
    const students = [
      { ...baseStudent, id: 'one', full_name: 'Ana Uno', phone: null, home_location_id: 'tiabaya' },
      { ...baseStudent, id: 'two', full_name: 'Ana Dos', home_location_id: 'umacollo' },
    ]
    expect(filterAdminStudents(students, 'ana', 'active', now, { locationId: 'tiabaya' }).map((row) => row.id)).toEqual(['one'])
  })

  it('sorts by membership expiry with undated students last and name as tie breaker', () => {
    const students = [
      { ...baseStudent, full_name: 'Sin fecha', membership_end: null },
      { ...baseStudent, full_name: 'Tarde', membership_end: '2026-07-30' },
      { ...baseStudent, full_name: 'Pronto', membership_end: '2026-07-20' },
    ]
    expect(filterAdminStudents(students, '', 'all', now, { sort: 'expiry' }).map((row) => row.full_name)).toEqual(['Pronto', 'Tarde', 'Sin fecha'])
  })
  it.each(['ana', '12345678', '999111222'])('matches the search value %s', (query) => {
    expect(filterAdminStudents([baseStudent], query, 'all')).toHaveLength(1)
  })

  it('normalizes accents while searching names', () => {
    expect(
      filterAdminStudents([{ ...baseStudent, full_name: 'Ángela Núñez' }], 'angela nunez', 'all'),
    ).toHaveLength(1)
  })

  it('filters by the visible status', () => {
    expect(filterAdminStudents([baseStudent], '', 'active', now)).toHaveLength(1)
    expect(filterAdminStudents([baseStudent], '', 'inactive', now)).toHaveLength(0)
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
