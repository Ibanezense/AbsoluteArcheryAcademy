import { expect, it } from 'vitest'
import { formatStudentHistoryDate } from './studentHistoryDates'
it('preserves membership civil dates independently of the browser timezone', () => {
  expect(formatStudentHistoryDate('2026-10-25')).toBe('25/10/2026')
})
it('puts expiry and weekly events on the academic day in Lima', () => {
  expect(formatStudentHistoryDate('2025-02-01T04:59:59Z')).toBe('31/01/2025')
  expect(formatStudentHistoryDate('2025-02-01T05:00:00Z')).toBe('01/02/2025')
})
it('does not invent dates when membership dates are absent', () => {
  expect(formatStudentHistoryDate(null)).toBe('—')
})
