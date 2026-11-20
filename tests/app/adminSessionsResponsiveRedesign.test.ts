import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin sessions responsive redesign', () => {
  it('uses a compact operational layout instead of a dense weekly card grid', () => {
    const sessions = source('app/admin/sesiones/page.tsx')

    expect(sessions).toContain('aria-label="Calendario de turnos"')
    expect(sessions).toContain('aria-label="Filtrar turnos por sede"')
    expect(sessions).toContain('sm:grid-cols-7')
    expect(sessions).toContain('aria-label="Ir a una fecha"')
    expect(sessions).not.toContain('overflow-x-auto')
  })

  it('keeps the admin sessions page responsive with compact empty and loading states', () => {
    const sessions = source('app/admin/sesiones/page.tsx')

    expect(sessions).toContain('Cargando turnos')
    expect(sessions).toContain('No hay turnos programados')
    expect(sessions).toContain('Crear turno este día')
    expect(sessions).toContain('Turnos programados')
    expect(sessions).toContain('Asistencias pendientes')
  })

  it('keeps session details expandable and destructive actions out of the collapsed summary', () => {
    const components = source('components/admin/AdminOperationalComponents.tsx')

    expect(components).toContain('Ver detalle')
    expect(components).toContain('Ocultar detalle')
    expect(components).toContain('attendanceLabel')
    expect(components).toContain('{expanded && (')
    expect(components).toContain('Cancelar por la academia')
    expect(components).toContain('aria-expanded={expanded}')
    expect(components).toContain('aria-controls={detailId}')
  })
})
