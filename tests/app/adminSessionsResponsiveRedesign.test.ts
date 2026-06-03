import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin sessions responsive redesign', () => {
  it('uses a compact operational layout instead of a dense weekly card grid', () => {
    const sessions = source('app/admin/sesiones/page.tsx')

    expect(sessions).toContain('SessionsKpiRow')
    expect(sessions).toContain('MonthlySessionsCalendar')
    expect(sessions).toContain('WeekDaySelector')
    expect(sessions).toContain('SessionDaySection')
    expect(sessions).toContain('SelectedDaySummary')
    expect(sessions).toContain('grid-cols-[minmax(0,1fr)]')
    expect(sessions).toContain('lg:grid-cols-[300px_minmax(0,1fr)]')
    expect(sessions).not.toContain('grid gap-4 xl:grid-cols-2')
  })

  it('keeps the admin sessions page responsive with compact empty and loading states', () => {
    const sessions = source('app/admin/sesiones/page.tsx')

    expect(sessions).toContain('SessionsSkeleton')
    expect(sessions).toContain('overflow-x-auto')
    expect(sessions).toContain('No hay turnos programados.')
    expect(sessions).toContain('Crear turno este dia')
    expect(sessions).toContain('Turnos esta semana')
    expect(sessions).toContain('Asistencia pendiente')
  })

  it('keeps session details expandable and destructive actions out of the collapsed summary', () => {
    const components = source('components/admin/AdminOperationalComponents.tsx')

    expect(components).toContain('Ver detalle')
    expect(components).toContain('Ocultar detalle')
    expect(components).toContain('Pasar asistencia')
    expect(components).toContain('{expanded && (')
    expect(components).toContain('Cancelar con reembolso')
    expect(components).toContain('Cancelar sin reembolso')
    expect(components).toContain('grid-cols-[minmax(0,1fr)]')
    expect(components).toContain('xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_220px]')
  })
})
