import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const register = readFileSync(join(process.cwd(), 'app/admin/intro/components/RegisterIntroModal.tsx'), 'utf8')
const edit = readFileSync(join(process.cwd(), 'app/admin/intro/IntroClient.tsx'), 'utf8')

describe('location-first intro registration', () => {
  it('requires an active location before loading and choosing a schedule', () => {
    expect(register).toContain('useAcademyLocations')
    expect(register).toContain("location.is_active")
    expect(register).toContain('selectedLocationId')
    expect(register).toContain('IntroClassesService.getAvailableSessions(31, selectedLocationId)')
    expect(register).toContain("sessionId: ''")
    expect(register).toContain('!selectedLocationId || !formData.sessionId')
  })

  it('shows useful location-specific session details and empty feedback', () => {
    expect(register).toContain('session.location_name')
    expect(register).toContain('.location_address')
    expect(register).toContain('dayjs(session.end_at).diff(dayjs(session.start_at),')
    expect(register).toContain('cupos libres')
    expect(register).toContain('No hay turnos con cupo en esta sede')
  })
})

describe('location-first intro rescheduling', () => {
  it('derives the current location and keeps the current assignment visible', () => {
    expect(edit).toContain('location_id: session.location_id')
    expect(edit).toContain('location_code: session.location_code')
    expect(edit).toContain('location_name: session.location_name')
    expect(edit).toContain('is_current_assignment: true')
    expect(edit).toContain('Turno actual')
  })

  it('clears the target schedule and reloads enabled sessions when location changes', () => {
    expect(edit).toContain('selectedLocationId')
    expect(edit).toContain('sessionId: nextLocationId === currentLocationId ? client.session_id :')
    expect(edit).toContain('IntroClassesService.getAvailableSessions(31, selectedLocationId)')
  })
})
