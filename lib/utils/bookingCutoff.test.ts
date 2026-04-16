import { describe, expect, it } from 'vitest'
import {
  buildBookingCutoffByDay,
  getBookingDayKey,
  hasBookingDayCutoffPassed,
} from './bookingCutoff'

describe('bookingCutoff', () => {
  it('builds each day cutoff from the earliest scheduled session and ignores cancelled ones', () => {
    const cutoffByDay = buildBookingCutoffByDay([
      { start_at: '2026-04-18T17:00:00-05:00', status: 'scheduled' },
      { start_at: '2026-04-18T10:00:00-05:00', status: 'scheduled' },
      { start_at: '2026-04-18T08:00:00-05:00', status: 'cancelled' },
      { start_at: '2026-04-19T16:00:00-05:00', status: 'scheduled' },
    ])

    expect(cutoffByDay[getBookingDayKey('2026-04-18T10:00:00-05:00')]).toBe('2026-04-18T08:00:00-05:00')
    expect(cutoffByDay[getBookingDayKey('2026-04-19T16:00:00-05:00')]).toBe('2026-04-19T14:00:00-05:00')
  })

  it('marks the day as closed once the cutoff timestamp is reached', () => {
    expect(
      hasBookingDayCutoffPassed('2026-04-18T08:00:00-05:00', '2026-04-18T07:59:00-05:00')
    ).toBe(false)

    expect(
      hasBookingDayCutoffPassed('2026-04-18T08:00:00-05:00', '2026-04-18T08:00:00-05:00')
    ).toBe(true)
  })
})
