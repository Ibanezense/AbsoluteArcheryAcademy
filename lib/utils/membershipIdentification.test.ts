import { describe, expect, it } from 'vitest'
import { attendanceForMembership, getAttendanceMembershipIdentity } from './studentAttendanceHistory'

const memberships = [
  { id: 'old', membership_code: 'MEM-2026-0048', start_date: '2026-09-15', end_date: '2026-10-14' },
  { id: 'new', membership_code: 'MEM-2026-0049', start_date: '2026-09-20', end_date: '2026-10-19' },
]

describe('membership identification', () => {
  it('distinguishes two cycles beginning in the same month by their stored identity', () => {
    expect(getAttendanceMembershipIdentity('old', memberships)).toEqual({ code: 'MEM-2026-0048', period: '15 sep 2026 – 14 oct 2026', needsReview: false })
    expect(getAttendanceMembershipIdentity('new', memberships).code).toBe('MEM-2026-0049')
  })
  it('flags missing attribution instead of selecting the current membership', () => {
    expect(getAttendanceMembershipIdentity(null, memberships)).toEqual({ code: 'Por revisar', period: 'Sin membresía vinculada', needsReview: true })
    expect(getAttendanceMembershipIdentity('missing', memberships).needsReview).toBe(true)
  })
  it('filters actual links including weekly events, even when the class month differs', () => {
    const rows = [{ active_membership_id: 'old', start_at: '2026-10-03' }, { active_membership_id: 'new', start_at: '2026-09-27' }, { active_membership_id: null, start_at: '2026-09-20' }]
    expect(attendanceForMembership(rows, 'old')).toEqual([rows[0]])
    expect(attendanceForMembership(rows, 'unlinked')).toEqual([rows[2]])
    expect(attendanceForMembership(rows, 'all')).toEqual(rows)
  })
})
