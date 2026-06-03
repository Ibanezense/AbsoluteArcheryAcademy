import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin intro upcoming visibility', () => {
  it('does not limit the pruebas page to the immediate weekend only', () => {
    const client = source('app/admin/intro/IntroClient.tsx')
    const service = source('lib/services/IntroClassesService.ts')

    expect(client).toContain('getUpcomingIntroSchedule')
    expect(client).not.toContain('getIntrosByWeekend()')
    expect(client).not.toContain('[weekendData.saturday.sessions, weekendData.sunday.sessions].flat()')
    expect(client).not.toContain('[data.saturday, data.sunday]')
    expect(service).toContain('static async getUpcomingIntroSchedule(daysAhead: number = 31)')
  })
})
