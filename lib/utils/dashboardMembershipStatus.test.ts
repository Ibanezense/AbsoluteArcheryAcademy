import { describe, expect, it } from 'vitest'
import { getDashboardMembershipBadge } from './dashboardMembershipStatus'

describe('getDashboardMembershipBadge', () => {
  it.each([
    ['scheduled', 'scheduled', 'Programada'],
    ['expired', 'expired', 'Vencida'],
    ['historical', 'expired', 'Vencida'],
    ['no_membership', 'no_membership', 'Sin membresía'],
    ['no_classes', 'no_classes', 'Sin clases'],
  ])('maps canonical status %s to %s', (membershipStatus, status, label) => {
    expect(getDashboardMembershipBadge({ membershipStatus })).toEqual({ status, label })
  })

  it('uses the end date only as a defensive fallback for an active membership', () => {
    const now = new Date('2026-08-01T12:00:00-05:00')

    expect(getDashboardMembershipBadge({
      membershipStatus: 'active',
      membershipEnd: '2026-07-31',
      now,
    })).toEqual({ status: 'expired', label: 'Vencida' })

    expect(getDashboardMembershipBadge({
      membershipStatus: 'scheduled',
      membershipEnd: '2026-07-31',
      now,
    })).toEqual({ status: 'scheduled', label: 'Programada' })
  })
})
