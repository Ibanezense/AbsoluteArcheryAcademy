import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import { operationalDate, sessionCalendarRange } from './adminCalendar'
import { weekDates } from './introCalendar'

describe('admin operational calendar', () => {
  it('validates civil input and falls back to today in Lima', () => {
    const now = new Date('2026-10-19T02:00:00Z')
    expect(operationalDate(null, now)).toBe('2026-10-18')
    expect(operationalDate('2026-02-30', now)).toBe('2026-10-18')
    expect(operationalDate('2026-10-19', now)).toBe('2026-10-19')
  })
  it('uses Monday through Sunday regardless of Day.js language', () => {
    for (const locale of ['es', 'en']) {
      dayjs.locale(locale)
      expect(weekDates('2026-10-18')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
      expect(weekDates('2026-10-19')[0]).toBe('2026-10-19')
    }
  })
  it('loads adjacent days in calendar weeks across month and year boundaries in Lima', () => {
    expect(sessionCalendarRange(2027, 0)).toEqual({ start: '2026-12-28T00:00:00-05:00', end: '2027-02-01T00:00:00-05:00' })
  })
})
