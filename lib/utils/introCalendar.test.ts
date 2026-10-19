import { describe, expect, it } from 'vitest'
import { calendarDate, weekDates, appointmentStatus, filterAppointments, canReschedule, type IntroAppointment } from './introCalendar'

const appointment = {
  booking_id: 'booking', intro_client_id: 'client', full_name: 'Laura Torres', age: 28,
  phone: '999888777', session_id: 'session', session_start: '2026-10-14T22:00:00Z',
  session_end: '2026-10-14T23:00:00Z', location_id: 'umacollo', location_name: 'Umacollo',
  location_code: 'umacollo', location_address: null, capacity: 4, booked_total: 1,
  booking_status: 'reserved', intro_class_type: 'paid', payment_status: 'pending',
  amount_paid: 45, payment_method: null, paid_at: null, courtesy_reason: null,
  pay_on_site: true, updated_at: '2026-10-11T20:00:00Z',
} satisfies IntroAppointment

describe('intro weekly calendar', () => {
  it('preserves civil dates rather than moving midnight UTC to the previous Lima day', () => {
    expect(calendarDate('2026-10-18')).toBe('2026-10-18')
  })
  it('uses the Lima day even when UTC has crossed midnight', () => {
    expect(calendarDate('2026-10-12T02:00:00Z')).toBe('2026-10-11')
  })
  it('returns a Monday to Sunday week across a year boundary', () => {
    expect(weekDates('2027-01-01')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  })
  it('keeps an on-site pending payment distinct from paid', () => {
    expect(appointmentStatus(appointment)).toBe('pending')
    expect(appointmentStatus({ ...appointment, payment_status: 'paid' })).toBe('paid')
  })
  it('prioritizes attendance and cancellation without changing payment data', () => {
    for (const status of ['attended', 'no_show', 'cancelled'] as const) {
      const row = { ...appointment, booking_status: status }
      expect(appointmentStatus(row)).toBe(status)
      expect(row.payment_status).toBe('pending')
    }
  })
  it('filters pending payments even on an attended card', () => {
    const row = { ...appointment, booking_status: 'attended' }
    expect(filterAppointments([row], { states: ['attended'], payment: 'pending', search: 'torres', locationId: 'umacollo' })).toEqual([row])
    expect(filterAppointments([row], { states: [], payment: 'paid', search: '', locationId: '' })).toEqual([])
  })
  it('only permits active appointments to be rescheduled', () => {
    expect(canReschedule(appointment)).toBe(true)
    expect(canReschedule({ ...appointment, booking_status: 'cancelled' })).toBe(false)
    expect(canReschedule({ ...appointment, booking_status: 'attended' })).toBe(false)
  })
})
