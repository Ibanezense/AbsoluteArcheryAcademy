import { describe, expect, it } from 'vitest'
import {
  getAdminQuickBookingDateRange,
  getQuickBookingStudentOptions,
  type QuickBookingStudent,
} from './adminQuickBooking'

const students: QuickBookingStudent[] = [
  {
    id: '1',
    full_name: 'Ana Torres',
    status: 'active',
    classes_remaining: 0,
  },
  {
    id: '2',
    full_name: 'Bruno Diaz',
    status: 'expired',
    classes_remaining: 8,
  },
  {
    id: '3',
    full_name: 'Carla Ruiz',
    status: 'no_classes',
    classes_remaining: 0,
  },
  {
    id: '4',
    full_name: 'Diego Paz',
    status: 'active',
    classes_remaining: 3,
  },
  {
    id: '5',
    full_name: 'Elena Mora',
    status: 'inactive',
    classes_remaining: 12,
  },
]

describe('admin quick booking helpers', () => {
  it('limits selected month ranges to at most seven days in the past', () => {
    const now = new Date('2026-04-30T15:00:00-05:00')

    expect(getAdminQuickBookingDateRange('2026-04', now)).toEqual({
      fromDate: '2026-04-23',
      toDate: '2026-04-30',
      minDate: '2026-04-23',
    })
  })

  it('returns an empty range when the selected month is older than the admin backfill window', () => {
    const now = new Date('2026-04-30T15:00:00-05:00')

    expect(getAdminQuickBookingDateRange('2026-03', now)).toEqual({
      fromDate: '2026-04-23',
      toDate: '2026-03-31',
      minDate: '2026-04-23',
    })
  })

  it('keeps future days in the current month visible for upcoming quick bookings', () => {
    const now = new Date('2026-04-10T15:00:00-05:00')

    expect(getAdminQuickBookingDateRange('2026-04-10', now)).toEqual({
      fromDate: '2026-04-03',
      toDate: '2026-04-30',
      minDate: '2026-04-03',
    })
  })

  it('keeps every active student visible even when current membership status would block self-service booking', () => {
    expect(getQuickBookingStudentOptions(students).map((student) => student.id)).toEqual(['1', '2', '3', '4'])
  })

  it('filters students by text and caps the rendered list for large academies', () => {
    const manyStudents = Array.from({ length: 80 }, (_, index) => ({
      id: `student-${index}`,
      full_name: `Alumno ${String(index).padStart(2, '0')}`,
      status: 'active' as const,
      classes_remaining: index,
    }))

    expect(getQuickBookingStudentOptions(manyStudents, 'alumno', 25)).toHaveLength(25)
    expect(getQuickBookingStudentOptions(manyStudents, 'Alumno 42')).toEqual([
      expect.objectContaining({ id: 'student-42' }),
    ])
  })
})
