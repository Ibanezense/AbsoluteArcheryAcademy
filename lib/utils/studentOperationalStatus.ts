import dayjs from 'dayjs'

export type StudentOperationalStatus = 'active' | 'expiring' | 'expired' | 'paused' | 'inactive'

export type StudentStatusFacts = {
  membershipStatus: string | null
  classesRemaining: number
  membershipEnd: string | null
  membershipExpiredAt: string | null
  effectiveStatus: string | null
  hasMembership: boolean
  isActive?: boolean
}

const INACTIVE_STATUSES = new Set(['inactive', 'retired', 'withdrawn', 'blocked', 'suspended'])

export function getStudentOperationalStatus(facts: StudentStatusFacts, now = new Date()): StudentOperationalStatus {
  if (INACTIVE_STATUSES.has(facts.effectiveStatus || '')) return 'inactive'

  const today = dayjs(now).startOf('day')
  const endDate = facts.membershipEnd ? dayjs(facts.membershipEnd).startOf('day') : null
  const daysLeft = endDate?.isValid() ? endDate.diff(today, 'day') : null
  const active = facts.membershipStatus === 'active' && facts.classesRemaining > 0 && (daysLeft === null || daysLeft >= 0)

  if (active) return daysLeft !== null && daysLeft <= 7 ? 'expiring' : 'active'

  const explicitExpiration = facts.membershipExpiredAt ? dayjs(facts.membershipExpiredAt).startOf('day') : null
  const expirationDay = explicitExpiration?.isValid()
    ? explicitExpiration
    : endDate?.isValid()
      ? endDate.add(1, 'day')
      : null

  if (expirationDay) {
    const daysExpired = Math.max(today.diff(expirationDay, 'day'), 0)
    if (daysExpired >= 61) return 'inactive'
    if (daysExpired >= 15) return 'paused'
    return 'expired'
  }

  if (facts.membershipStatus === 'expired' || (facts.hasMembership && facts.classesRemaining <= 0) || facts.effectiveStatus === 'expired') return 'expired'
  if (facts.effectiveStatus === 'paused') return 'paused'
  if (facts.isActive === false) return 'paused'
  return 'active'
}
