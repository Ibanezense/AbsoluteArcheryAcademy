import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  join(process.cwd(), 'app', 'admin', 'sesiones', 'editar', '[id]', 'page.tsx'),
  'utf8',
)

const service = readFileSync(
  join(process.cwd(), 'lib', 'services', 'adminSessionsService.ts'),
  'utf8',
)

describe('manual session location', () => {
  it('requires a location when creating or editing a manual session', () => {
    expect(page).toContain('useAcademyLocations')
    expect(page).toContain('location_id')
    expect(page).toContain('Selecciona una sede')
    expect(page).toContain('locationId: session.location_id')
  })

  it('passes the location through the atomic session RPC', () => {
    expect(service).toContain('locationId: string')
    expect(service).toContain('p_location_id: input.locationId')
  })
})
