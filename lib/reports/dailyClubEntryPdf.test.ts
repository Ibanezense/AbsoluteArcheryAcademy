import { describe, expect, it } from 'vitest'
import { createDailyClubEntryPdf } from './dailyClubEntryPdf'

describe('daily entry PDF by site', () => {
  const location = { id: 'site', name: 'Umacollo', code: 'umacollo' }
  it('requires a selected site before generating a PDF', () => {
    expect(() => createDailyClubEntryPdf([], '2026-10-15', null)).toThrow('Selecciona una sede')
  })
  it('identifies the chosen site in the filename and on every page, including automatic overflow', () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({ name: `Alumno ${i} Apellido Compuesto Apellido Segundo Apellido Largo`, dni: '12345678', type: 'student' as const }))
    const { doc, filename } = createDailyClubEntryPdf(rows, '2026-10-15', location)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expect(filename).toBe('ingreso-archery-umacollo-15-10-2026.pdf')
    expect(doc.output().match(/Sede: Umacollo/g)).toHaveLength(doc.getNumberOfPages())
    expect(doc.output()).not.toContain('Sede: Tiabaya')
  })
})
