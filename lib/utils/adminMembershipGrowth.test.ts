import { describe, expect, it } from 'vitest'
import { buildMembershipGrowth, buildMembershipGrowthReport, type GrowthMembership } from './adminMembershipGrowth'
const membership = (student: string, start: string, end: string | null, patch = {}): GrowthMembership => ({ id: `${student}-${start}`, student_id: student, start_date: start, end_date: end, status: 'expired', membership_origin: 'paid', ...patch })
const month = (rows: GrowthMembership[], date = '2026-11-01', key = '2026-09') => buildMembershipGrowth(rows, date, 6).find(row => row.month === key)!

describe('membership growth by expiry cohort with thirty-day grace', () => {
  it('attributes an October renewal to the September expiry cohort', () => {
    const rows = [membership('a', '2026-08-20', '2026-09-20'), membership('a', '2026-10-10', '2026-11-10')]
    expect(month(rows)).toMatchObject({ renewed: 1, notRenewed: 0, pending: 0, eligible: 1, renewalRate: 100 })
    expect(month(rows, '2026-11-01', '2026-10')).toMatchObject({ renewed: 0, reactivated: 0 })
  })
  it('accepts day thirty and treats day thirty-one as reactivation', () => {
    const base = membership('a', '2026-08-20', '2026-09-20')
    expect(month([base, membership('a', '2026-10-20', '2026-11-20')])).toMatchObject({ renewed: 1, notRenewed: 0 })
    const late = [base, membership('a', '2026-10-21', '2026-11-21')]
    expect(month(late)).toMatchObject({ renewed: 0, notRenewed: 1 })
    expect(month(late, '2026-11-01', '2026-10')).toMatchObject({ newStudents: 0, reactivated: 1 })
  })
  it('keeps expiry pending through day thirty and records loss the following day', () => {
    const rows = [membership('a', '2026-08-20', '2026-09-20')]
    expect(month(rows, '2026-10-20')).toMatchObject({ pending: 1, notRenewed: 0, eligible: 1, renewalRate: null })
    expect(month(rows, '2026-10-21')).toMatchObject({ pending: 0, notRenewed: 1, renewalRate: null })
  })
  it('uses thirty civil days across short months and leap years', () => {
    const ordinary = [membership('a', '2025-01-01', '2025-01-31')]
    expect(month(ordinary, '2025-03-02', '2025-01')).toMatchObject({ pending: 1, notRenewed: 0, provisional: true })
    expect(month(ordinary, '2025-03-03', '2025-01')).toMatchObject({ pending: 0, notRenewed: 1, provisional: false })
    const leap = [membership('a', '2024-01-01', '2024-01-31'), membership('a', '2024-03-01', '2024-04-01')]
    expect(month(leap, '2024-03-02', '2024-01')).toMatchObject({ renewed: 1, renewalRate: 100 })
  })
  it('keeps the expiry of an open-ended successor as absent without losing its renewal', () => {
    const rows = [membership('a', '2026-08-01', '2026-09-01'), membership('a', '2026-09-02', null), membership('a', '2026-09-03', '2026-09-30')]
    expect(month(rows)).toMatchObject({ renewed: 1, eligible: 1, notRenewed: 0 })
    expect(month(rows, '2026-11-01', '2026-10')).toMatchObject({ eligible: 0 })
  })
  it('keeps a cohort provisional until the last expiry grace has elapsed', () => {
    const rows = [membership('a', '2026-08-20', '2026-09-20')]
    expect(month(rows, '2026-10-30')).toMatchObject({ provisional: true, renewalRate: null })
    expect(month(rows, '2026-10-31')).toMatchObject({ provisional: false, renewalRate: 0 })
  })
  it('recognizes an already known future renewal without counting future new students', () => {
    const rows = [membership('a', '2026-09-01', '2026-10-25'), membership('a', '2026-10-26', '2026-11-25'), membership('b', '2026-10-29', '2026-11-29')]
    expect(month(rows, '2026-10-19', '2026-10')).toMatchObject({ newStudents: 0, renewed: 1, pending: 0, eligible: 1 })
  })
  it('uses only the last effective expiry in a month for exclusive status', () => {
    const rows = [membership('a', '2026-08-01', '2026-09-01'), membership('a', '2026-09-02', '2026-09-20')]
    expect(month(rows, '2026-10-10')).toMatchObject({ renewed: 0, pending: 1, notRenewed: 0, eligible: 1 })
    expect(month(rows, '2026-11-01')).toMatchObject({ renewed: 0, pending: 0, notRenewed: 1, eligible: 1 })
  })
  it('does not let a not-yet-started cycle replace the current expiry cohort', () => {
    const rows = [membership('a', '2026-08-01', '2026-09-01'), membership('a', '2026-09-25', '2026-09-30')]
    expect(month(rows, '2026-09-10')).toMatchObject({ renewed: 1, pending: 0, eligible: 1 })
  })
  it('counts each person once even after several starts and expiries in the same month', () => {
    const rows = [membership('a', '2026-09-01', '2026-09-05'), membership('a', '2026-09-06', '2026-09-10'), membership('a', '2026-09-11', '2026-10-11')]
    expect(month(rows)).toMatchObject({ newStudents: 1, renewed: 1, notRenewed: 0, pending: 0, eligible: 1 })
  })
  it('ignores duplicates and contained cycles, including equal-start identifiers', () => {
    for (const [shortId, longId] of [['a', 'b'], ['b', 'a']]) {
      const rows = [membership('a', '2026-08-01', '2026-09-01', { id: shortId }), membership('a', '2026-08-01', '2026-10-01', { id: longId }), membership('a', '2026-09-01', '2026-09-15')]
      expect(month(rows)).toMatchObject({ renewed: 0, eligible: 0 })
    }
  })
  it('recognizes an overlapping cycle only when it extends coverage', () => {
    const rows = [membership('a', '2026-08-01', '2026-09-01'), membership('a', '2026-08-20', '2026-10-01'), membership('a', '2026-08-25', '2026-08-30')]
    expect(month(rows)).toMatchObject({ renewed: 1, eligible: 1 })
  })
  it('counts first paid starts rather than gifts, drafts or previous paid memberships', () => {
    const rows = [membership('a', '2026-08-01', '2026-08-31'), membership('a', '2026-09-01', '2026-09-30'), membership('b', '2026-08-01', '2026-08-31', { membership_origin: 'gift' }), membership('b', '2026-09-03', '2026-10-03'), membership('c', '2026-09-01', '2026-09-30', { status: 'draft' })]
    expect(month(rows).newStudents).toBe(1)
  })
  it('does not treat gifts, cancelled or draft cycles as renewal coverage', () => {
    for (const patch of [{ membership_origin: 'gift' }, { status: 'cancelled' }, { status: 'draft' }]) {
      const rows = [membership('a', '2026-08-01', '2026-09-01'), membership('a', '2026-09-02', '2026-12-31', patch)]
      expect(month(rows)).toMatchObject({ renewed: 0, notRenewed: 1 })
    }
  })
  it('counts reactivation only when the late returning membership has started', () => {
    const rows = [membership('a', '2026-07-01', '2026-08-01'), membership('a', '2026-10-25', '2026-11-25')]
    expect(month(rows, '2026-10-19', '2026-10').reactivated).toBe(0)
    expect(month(rows, '2026-10-25', '2026-10').reactivated).toBe(1)
    expect(month(rows, '2026-10-25', '2026-08').notRenewed).toBe(1)
  })
  it('counts unique reactivated students even with repeated returns within a month', () => {
    const rows = [membership('a', '2026-06-01', '2026-06-30'), membership('a', '2026-09-01', '2026-09-01'), membership('a', '2026-10-02', '2026-10-02')]
    expect(month(rows, '2026-11-15', '2026-10').reactivated).toBe(1)
  })
  it('includes historical cycles and treats open ends as continuing without an expiry cohort', () => {
    expect(month([membership('a', '2026-09-01', null, { status: 'historical' })])).toMatchObject({ newStudents: 1, notRenewed: 0, eligible: 0, renewalRate: null })
  })
  it('uses a student denominator and null rate for empty closed cohorts', () => {
    const rows = [membership('a', '2026-08-01', '2026-09-01'), membership('a', '2026-09-02', '2026-11-01'), membership('b', '2026-08-01', '2026-09-01'), membership('c', '2026-08-01', '2026-09-01')]
    expect(month(rows)).toMatchObject({ renewed: 1, notRenewed: 2, pending: 0, eligible: 3 })
    expect(month(rows).renewalRate).toBeCloseTo(100 / 3)
    expect(month([])).toMatchObject({ eligible: 0, renewalRate: null })
  })
  it('returns civil monthly series across years with genuine zero months', () => {
    expect(buildMembershipGrowth([], '2026-01-02', 3).map(row => row.month)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('rejects malformed dates, reversed histories, missing identity and invalid origins', () => {
    expect(() => month([membership('a', '2026-02-30', '2026-03-10')])).toThrow()
    expect(() => month([membership('a', '2026-09-30', '2026-09-01')])).toThrow()
    expect(() => month([membership('', '2026-09-01', '2026-09-30')])).toThrow()
    expect(() => month([membership('a', '2026-09-01', '2026-09-30', { membership_origin: 'unknown' })])).toThrow()
  })
  it('quarantines the entire inconsistent student history and reports exclusion', () => {
    const result = buildMembershipGrowthReport([membership('bad', '2026-09-01', '2026-09-30'), membership('bad', '2026-08-01', '2026-07-07'), membership('good', '2026-09-01', '2026-09-30')], '2026-11-01', 3)
    expect(result.issues).toEqual([{ studentId: 'bad', message: 'Una membresía vence antes de su inicio.' }])
    expect(result.rows.find(row => row.month === '2026-09')).toMatchObject({ newStudents: 1, notRenewed: 1, eligible: 1 })
  })
})
