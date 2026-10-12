import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
const form = readFileSync(join(process.cwd(), 'app/admin/intro/components/IntroAppointmentForm.tsx'), 'utf8')

describe('location-first intro appointments', () => {
  it('loads the selected week only after a site is selected', () => {
    expect(form).toContain('useAcademyLocations')
    expect(form).toContain('location.is_active')
    expect(form).toContain('enabled: Boolean(locationId)')
    expect(form).toContain('IntroClassesService.getCalendar(dates[0], dates[6], locationId)')
  })
  it('clears the schedule when changing site and shows availability feedback', () => {
    expect(form).toContain("setLocationId(event.target.value); setSessionId('')")
    expect(form).toContain('cupos libres')
    expect(form).toContain('No hay turnos con cupo en esta sede')
  })
  it('keeps the current assignment editable even when it is full or historical', () => {
    expect(form).toContain('currentAssignment')
    expect(form).toContain('session.session_id === client?.session_id')
    expect(form).toContain('Turno actual')
  })
  it('requires an explicit confirmation when editing across sites', () => {
    expect(form).toContain('locationId !== client.location_id')
    expect(form).toContain('Confirmo el traslado')
    expect(form).toContain('input required type="checkbox"')
  })
})
