import { describe, expect, it } from 'vitest'
import { buildMembershipGrowth, buildMembershipGrowthReport, type GrowthMembership } from './adminMembershipGrowth'
const membership = (student: string, start: string, end: string | null, patch = {}): GrowthMembership => ({ id: `${student}-${start}`, student_id: student, start_date: start, end_date: end, status: 'expired', membership_origin: 'paid', ...patch })
const month = (rows: GrowthMembership[], date = '2026-03-10', key = '2026-01') => buildMembershipGrowth(rows, date, 3).find(row => row.month === key)!

describe('membership growth business definitions', () => {
  it('counts first membership starts, not subsequent renewals or gifts', () => {
    const rows = [membership('a', '2025-12-01', '2025-12-31'), membership('a', '2026-01-01', '2026-01-31'), membership('b', '2026-01-03', '2026-01-20'), membership('c', '2026-01-01', '2026-01-31', { membership_origin: 'gift' })]
    expect(month(rows).newStudents).toBe(1)
  })
  it('waits seven full days after expiry and attributes the loss to the expiry month', () => {
    const rows = [membership('a', '2026-01-01', '2026-01-31')]
    expect(month(rows, '2026-02-07').notRenewed).toBe(0)
    expect(month(rows, '2026-02-07').pending).toBe(1)
    expect(month(rows, '2026-02-07').provisional).toBe(true)
    expect(month(rows, '2026-02-08').notRenewed).toBe(1)
    expect(month(rows, '2026-02-08').provisional).toBe(false)
  })
  it('accepts a renewal on the seventh day, including prepaid future cycles', () => {
    const rows = [membership('a', '2026-01-01', '2026-01-31'), membership('a', '2026-02-07', '2026-04-01', { status: 'active' })]
    expect(month(rows).notRenewed).toBe(0)
    expect(month(rows, '2026-03-10', '2026-02').reactivated).toBe(0)
  })
  it('retains a past loss when the student later returns, without counting a new student', () => {
    const rows = [membership('a', '2026-01-01', '2026-01-31'), membership('a', '2026-02-08', '2026-03-31')]
    expect(month(rows).notRenewed).toBe(1)
    expect(month(rows, '2026-03-10', '2026-02')).toMatchObject({ newStudents: 0, reactivated: 1 })
  })
  it('merges overlapping memberships and uses the furthest expiry', () => {
    const rows = [membership('a', '2026-01-01', '2026-01-31'), membership('a', '2026-01-10', '2026-02-15'), membership('a', '2026-01-20', '2026-01-25')]
    expect(month(rows).notRenewed).toBe(0)
    expect(month(rows, '2026-03-10', '2026-02').notRenewed).toBe(1)
  })
  it('counts an individual once per month even when two separate episodes end', () => {
    const rows = [membership('a', '2026-01-01', '2026-01-03'), membership('a', '2026-01-15', '2026-01-20')]
    expect(month(rows).notRenewed).toBe(1)
    expect(month(rows).reactivated).toBe(1)
  })
  it('does not treat gifts or cancelled/draft cycles as renewals', () => {
    const base = membership('a', '2026-01-01', '2026-01-31')
    for (const patch of [{ membership_origin: 'gift' }, { status: 'cancelled' }, { status: 'draft' }]) {
      expect(month([base, membership('a', '2026-02-01', '2026-12-31', patch)]).notRenewed).toBe(1)
    }
  })
  it('includes historical cycles and treats an open end as continuing', () => {
    expect(month([membership('a', '2026-01-01', null, { status: 'historical' })])).toMatchObject({ newStudents: 1, notRenewed: 0 })
  })
  it('does not count scheduled first memberships before their start date', () => {
    expect(month([membership('a', '2026-03-20', '2026-04-20')], '2026-03-10', '2026-03').newStudents).toBe(0)
  })
  it('returns a civil monthly series across years, including genuine empty months', () => {
    expect(buildMembershipGrowth([], '2026-01-02', 3).map(row => row.month)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('rejects malformed histories instead of silently reporting zero', () => {
    expect(() => month([membership('a', '2026-02-30', '2026-03-10')])).toThrow()
    expect(() => month([membership('a', '2026-01-31', '2026-01-01')])).toThrow()
  })
  it('quarantines the entire inconsistent student history and reports the exclusion', () => {
    const result = buildMembershipGrowthReport([
      membership('bad', '2026-01-01', '2026-01-31'),
      membership('bad', '2026-08-01', '2026-07-07'),
      membership('good', '2026-01-01', '2026-01-31'),
    ], '2026-03-10', 3)
    expect(result.issues).toEqual([{ studentId: 'bad', message: 'Una membresía vence antes de su inicio.' }])
    expect(result.rows.find(row => row.month === '2026-01')).toMatchObject({ newStudents: 1, notRenewed: 1 })
  })
})
