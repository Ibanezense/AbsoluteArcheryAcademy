import { describe, expect, it } from 'vitest'
import { canCorrectCancelledAttendance } from './correctCancelledAttendance'

describe('canCorrectCancelledAttendance', () => {
  const now = new Date('2026-11-09T17:00:00Z')
  it('offers correction only for past cancelled bookings', () => {
    expect(canCorrectCancelledAttendance({ status: 'cancelled', source: 'booking', start_at: '2026-11-08T21:00:00Z' }, now)).toBe(true)
    expect(canCorrectCancelledAttendance({ status: 'cancelled', start_at: '2026-11-10T21:00:00Z' }, now)).toBe(false)
    expect(canCorrectCancelledAttendance({ status: 'attended', start_at: '2026-11-08T21:00:00Z' }, now)).toBe(false)
    expect(canCorrectCancelledAttendance({ status: 'cancelled', source: 'expiry', start_at: '2026-11-08T21:00:00Z' }, now)).toBe(false)
    expect(canCorrectCancelledAttendance({ status: 'cancelled', start_at: null }, now)).toBe(false)
  })
})
