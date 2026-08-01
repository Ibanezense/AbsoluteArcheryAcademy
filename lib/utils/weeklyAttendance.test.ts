import { describe, expect, it } from 'vitest'
import { getWeeklyAttendanceWindow } from '@/lib/utils/weeklyAttendance'

describe('getWeeklyAttendanceWindow', () => {
  it('calculates the Thursday-to-Sunday window for a Sunday', () => {
    expect(getWeeklyAttendanceWindow('2026-08-02')).toEqual({
      isSunday: true,
      weekStart: '2026-07-30',
      weekEnd: '2026-08-02',
    })
  })

  it('does not enable the weekly review outside Sunday', () => {
    expect(getWeeklyAttendanceWindow('2026-08-01').isSunday).toBe(false)
  })
})
