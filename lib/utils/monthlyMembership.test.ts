import { describe, expect, it } from 'vitest'
import { membershipCycleEndDate } from './monthlyMembership'
describe('monthly membership validity', () => {
  it.each([
    ['2026-10-20', 30, 1, '2026-11-20'],
    ['2026-01-31', 30, 1, '2026-02-28'],
    ['2028-01-31', 30, 1, '2028-02-29'],
    ['2026-01-31', 30, 2, '2026-03-31'],
    ['2026-12-20', 30, 2, '2027-02-20'],
    ['2026-10-20', 1, 1, '2026-10-20'],
    ['2026-10-20', 7, 1, '2026-10-26'],
  ])('%s duration %s period %s ends %s', (start, duration, period, end) => {
    expect(membershipCycleEndDate(start, duration, period)).toBe(end)
  })
  it('rejects invalid date-only values', () => {
    expect(() => membershipCycleEndDate('2026-02-30', 30)).toThrow()
    expect(() => membershipCycleEndDate('2026-10-20', 0)).toThrow()
  })
})
