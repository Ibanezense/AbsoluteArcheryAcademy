import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin quick booking redesign', () => {
  it('mounts the quick booking flow as its own wide modal instead of the generic dark wrapper', () => {
    const page = source('app/admin/page.tsx')
    const modal = source('components/AdminQuickBooking.tsx')

    expect(page).not.toContain('<Modal title="Reserva rapida"')
    expect(modal).toContain('isOpen: boolean')
    expect(modal).toContain('onClose: () => void')
    expect(modal).toContain('fixed inset-0 z-[110]')
    expect(modal).toContain('max-w-6xl')
    expect(modal).toContain('bg-white')
  })

  it('keeps a two-column desktop layout with summary and sticky footer actions', () => {
    const modal = source('components/AdminQuickBooking.tsx')

    expect(modal).toContain('xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]')
    expect(modal).toContain('Resumen de la reserva')
    expect(modal).toContain('Alertas')
    expect(modal).toContain('sticky bottom-0')
    expect(modal).toContain('Crear reserva')
    expect(modal).toContain('Cancelar')
  })

  it('shows visual turn cards and student context instead of only stacked native selects', () => {
    const modal = source('components/AdminQuickBooking.tsx')

    expect(modal).toContain('Buscar por nombre, DNI o telefono')
    expect(modal).toContain('selectedStudentData')
    expect(modal).toContain('Clases disponibles')
    expect(modal).toContain('sessionsByDate')
    expect(modal).toContain('sessionsForSelectedDate.map((session) =>')
    expect(modal).toContain('Forzar reserva aunque el turno este sin cupo')
  })
})
