import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  join(process.cwd(), 'app', 'admin', 'ajustes', 'infraestructura', 'InfraestructuraClientPage.tsx'),
  'utf8',
)

describe('admin recurring intro schedule settings', () => {
  it('groups recurring templates by location with clear empty states', () => {
    expect(page).toContain('templatesByLocation')
    expect(page).toContain('location.name')
    expect(page).toContain('No hay horarios recurrentes configurados en esta sede')
  })

  it('lets admins choose location and intro availability when adding a day', () => {
    expect(page).toContain('name="location_id"')
    expect(page).toContain('name="allows_intro"')
    expect(page).toContain('Acepta clases de prueba')
    expect(page).toContain('locationId')
    expect(page).toContain('allowsIntro')
  })

  it('shows location and trial badges on every schedule card', () => {
    expect(page).toContain('template.location?.name')
    expect(page).toContain("template.allows_intro ? 'Clases de prueba' : 'Solo alumnos'")
  })

  it('uses two students per target at Umacollo and four at Tiabaya', () => {
    expect(page).toContain("selectedLocationCode === 'umacollo' ? 2 : 4")
  })
})
