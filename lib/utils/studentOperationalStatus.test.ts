import { describe, expect, it } from 'vitest'
import { getStudentOperationalStatus } from '@/lib/utils/studentOperationalStatus'

const now = new Date('2026-07-15T12:00:00-05:00')

function facts(overrides = {}) {
  return {
    membershipStatus: 'active',
    classesRemaining: 8,
    membershipEnd: '2026-07-30',
    membershipExpiredAt: null,
    effectiveStatus: 'active',
    hasMembership: true,
    ...overrides,
  }
}

describe('getStudentOperationalStatus', () => {
  it('uses the approved lifecycle boundaries', () => {
    expect(getStudentOperationalStatus(facts({ membershipEnd: '2026-07-20' }), now)).toBe('expiring')
    expect(getStudentOperationalStatus(facts({ membershipStatus: 'expired', classesRemaining: 0, membershipExpiredAt: '2026-07-01T10:00:00-05:00' }), now)).toBe('expired')
    expect(getStudentOperationalStatus(facts({ membershipStatus: 'expired', classesRemaining: 0, membershipExpiredAt: '2026-06-30T10:00:00-05:00' }), now)).toBe('paused')
    expect(getStudentOperationalStatus(facts({ membershipStatus: 'expired', classesRemaining: 0, membershipExpiredAt: '2026-05-16T10:00:00-05:00' }), now)).toBe('paused')
    expect(getStudentOperationalStatus(facts({ membershipStatus: 'expired', classesRemaining: 0, membershipExpiredAt: '2026-05-15T10:00:00-05:00' }), now)).toBe('inactive')
  })

  it('groups protected operational states as inactive', () => {
    expect(getStudentOperationalStatus(facts({ effectiveStatus: 'blocked' }), now)).toBe('inactive')
  })

  it('keeps a disabled student without lifecycle metadata in pause', () => {
    expect(getStudentOperationalStatus(facts({
      isActive: false,
      membershipStatus: null,
      classesRemaining: 0,
      membershipEnd: null,
      membershipExpiredAt: null,
      effectiveStatus: null,
      hasMembership: false,
    }), now)).toBe('paused')
  })
})
