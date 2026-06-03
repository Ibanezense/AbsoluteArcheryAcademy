import { describe, expect, it } from 'vitest'
import { canStudentCancelBooking } from './bookingCancellation'

describe('canStudentCancelBooking', () => {
  it('allows a reserved booking to be cancelled before the class starts', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'reserved',
          start_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T19:30:00.000Z'),
      ),
    ).toBe(true)
  })

  it('allows a reserved booking to be cancelled exactly at the class start', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'reserved',
          start_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T20:00:00.000Z'),
      ),
    ).toBe(true)
  })

  it('does not allow cancellation after the class starts', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'reserved',
          start_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T20:01:00.000Z'),
      ),
    ).toBe(false)
  })

  it('does not allow cancellation of non-reserved bookings', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'attended',
          start_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T19:30:00.000Z'),
      ),
    ).toBe(false)
  })
})
