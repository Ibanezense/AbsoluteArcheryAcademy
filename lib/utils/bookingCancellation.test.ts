import { describe, expect, it } from 'vitest'
import { canStudentCancelBooking } from './bookingCancellation'

describe('canStudentCancelBooking', () => {
  it('allows a reserved booking to be cancelled before the class ends', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'reserved',
          end_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T19:30:00.000Z'),
      ),
    ).toBe(true)
  })

  it('does not allow cancellation after the class has ended', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'reserved',
          end_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T20:00:00.000Z'),
      ),
    ).toBe(false)
  })

  it('does not allow cancellation of non-reserved bookings', () => {
    expect(
      canStudentCancelBooking(
        {
          status: 'attended',
          end_at: '2026-04-30T20:00:00.000Z',
        },
        new Date('2026-04-30T19:30:00.000Z'),
      ),
    ).toBe(false)
  })
})
