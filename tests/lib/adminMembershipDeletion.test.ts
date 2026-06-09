import { describe, expect, it } from 'vitest'
import { canDeleteExpiredMembership } from '../../lib/utils/adminMembershipDeletion'

describe('admin membership deletion rules', () => {
  it('allows deleting expired or closed memberships only', () => {
    expect(canDeleteExpiredMembership({ status: 'expired', end_date: '2026-01-01' })).toBe(true)
    expect(canDeleteExpiredMembership({ status: 'historical', end_date: '2026-01-01' })).toBe(true)
    expect(canDeleteExpiredMembership({ status: 'cancelled', end_date: null })).toBe(true)
    expect(canDeleteExpiredMembership({ status: 'consumed', end_date: null })).toBe(true)
    expect(canDeleteExpiredMembership({ status: 'active', end_date: '2026-01-01' }, '2026-06-08')).toBe(true)
    expect(canDeleteExpiredMembership({ status: 'active', end_date: '2026-06-26' }, '2026-06-08')).toBe(false)
    expect(canDeleteExpiredMembership({ status: 'active', end_date: null }, '2026-06-08')).toBe(false)
  })
})
