import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('admin intro date navigation', () => {
  it('queries the visible week and supports previous weeks as well as future ones', () => {
    const hook = readFileSync(join(process.cwd(), 'lib/hooks/useIntroCalendar.ts'), 'utf8')
    const client = readFileSync(join(process.cwd(), 'app/admin/intro/components/IntroCalendarClient.tsx'), 'utf8')
    expect(hook).toContain('IntroClassesService.getCalendar(dateFrom, dateTo, locationId)')
    expect(client).toContain('useIntroCalendar(dates[0], dates[6], filters.locationId)')
    expect(client).toContain('shiftDate(date, days)')
    expect(client).not.toContain('getIntrosByWeekend()')
  })
})
