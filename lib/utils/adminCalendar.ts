import { calendarDate, shiftDate, weekDates } from './introCalendar'

export function operationalDate(value?: string | null, now = new Date()): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`)
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value
  }
  return calendarDate(now)
}

// Month is zero-based. Include complete weeks and use a half-open Lima range.
export function sessionCalendarRange(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const last = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  return { start: `${weekDates(first)[0]}T00:00:00-05:00`, end: `${shiftDate(weekDates(last)[6], 1)}T00:00:00-05:00` }
}
