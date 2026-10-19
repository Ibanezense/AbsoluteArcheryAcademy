import { describe, expect, it } from 'vitest'
import { attendanceHref, administrativeBookingHref } from './adminNavigation'

describe('admin task destinations', () => {
  it('preserves date and session when opening attendance', () => {
    expect(attendanceHref('2026-10-18', 'session-a')).toBe('/admin/asistencia?date=2026-10-18&sessionId=session-a')
    expect(attendanceHref('2026-10-18')).toBe('/admin/asistencia?date=2026-10-18')
  })
  it('keeps rescheduling within the administrative student context', () => {
    expect(administrativeBookingHref('student-a')).toBe('/admin/alumnos/student-a?tab=bookings')
    expect(administrativeBookingHref(null)).toBe('/admin/sesiones')
  })
})
