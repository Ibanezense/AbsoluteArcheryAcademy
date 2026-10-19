import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const source = (path: string) => readFileSync(path, 'utf8')
describe('operational module audit integration', () => {
  it('opens membership assignment on demand and accepts the student handoff', () => {
    const page = source('app/admin/membresias/page.tsx')
    expect(page).toContain('saleOpen &&')
    expect(page).toContain("get('studentId')")
    expect(page).toContain('Buscar alumno para la venta')
    expect(page).not.toContain('FIFO ·')
  })
  it('offers a daily mobile agenda with explicit editing and separate payment information', () => {
    const client = source('app/admin/intro/components/IntroCalendarClient.tsx')
    expect(client).toContain('IntroDayAgenda')
    expect(client).toContain("matchMedia('(min-width: 1024px)')")
    const agenda = source('app/admin/intro/components/IntroDayAgenda.tsx')
    expect(agenda).toContain('IntroSessionSlot')
    expect(agenda).toContain('calendarDate(session.start_at) === date')
  })
})
