import { describe, expect, it } from 'vitest'
import { getLimaWeek, normalizeWeeklySummary } from './adminWeeklySummary'

describe('calendar week in Lima', () => {
  it('keeps Sunday through the last millisecond, even on UTC Monday', () => {
    expect(getLimaWeek(new Date('2026-10-19T04:59:59.999Z'))).toEqual({ startDate: '2026-10-12', endDate: '2026-10-18', nextMonday: '2026-10-19T05:00:00.000Z' })
  })
  it('changes at Monday midnight and keeps the same cohort through Sunday', () => {
    const week = { startDate: '2026-10-19', endDate: '2026-10-25', nextMonday: '2026-10-26T05:00:00.000Z' }
    expect(getLimaWeek(new Date('2026-10-19T05:00:00Z'))).toEqual(week)
    expect(getLimaWeek(new Date('2026-10-26T04:59:59Z'))).toEqual(week)
  })
  it('handles a week spanning two years', () => {
    expect(getLimaWeek(new Date('2027-01-01T15:00:00Z'))).toEqual({ startDate: '2026-12-28', endDate: '2027-01-03', nextMonday: '2027-01-04T05:00:00.000Z' })
  })
})

describe('weekly response integrity', () => {
  const valid = { startDate: '2026-10-19', endDate: '2026-10-25', reservations: 4, scheduledSessions: 3, availableSlots: null, pendingConfirmations: 2, attendancePending: 3 }
  it('retains unavailable capacity and valid zero populations', () => {
    expect(normalizeWeeklySummary(valid, '2026-10-19')).toEqual(valid)
    expect(normalizeWeeklySummary({ ...valid, reservations: 0, availableSlots: 0 }, '2026-10-19').availableSlots).toBe(0)
  })
  it('rejects missing, negative or incomplete responses instead of showing zero', () => {
    for (const raw of [null, {}, { ...valid, reservations: undefined }, { ...valid, scheduledSessions: -1 }, { ...valid, availableSlots: undefined }]) {
      expect(() => normalizeWeeklySummary(raw, '2026-10-19')).toThrow()
    }
  })
  it('rejects an old cohort and inconsistent end date', () => {
    expect(() => normalizeWeeklySummary(valid, '2026-10-26')).toThrow()
    expect(() => normalizeWeeklySummary({ ...valid, endDate: '2026-10-26' }, '2026-10-19')).toThrow()
  })
})
