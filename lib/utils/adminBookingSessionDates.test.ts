import { describe, expect, it } from 'vitest'
import { groupAdminBookingSessions } from './adminQuickBooking'

describe('booking days in Peru', () => {
  it('keeps a 19:00 Umacollo turn on its local date rather than the following UTC date', () => {
    const sessions = [{ session_id: 'evening', start_at: '2026-10-08T00:00:00Z' }]
    const groups = groupAdminBookingSessions(sessions)
    expect(groups['2026-10-07']).toEqual(sessions)
    expect(groups['2026-10-08']).toBeUndefined()
  })
})
