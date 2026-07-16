import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin students compact list', () => {
  it('renders the approved desktop columns and mobile list from one filtered collection', () => {
    const page = source('app/admin/alumnos/page.tsx')

    expect(page).toContain('filterAdminStudents')
    expect(page).toContain('StudentStatusBadge')
    expect(page).toContain('hidden md:block')
    expect(page).toContain('md:hidden')
    expect(page).toContain('Teléfono')
    expect(page).toContain('Membresía')
    expect(page).toContain('Última asistencia')
    expect(page).toContain('Fecha de ingreso')
  })

  it('uses one search field and the four approved visible status filters', () => {
    const page = source('app/admin/alumnos/page.tsx')

    expect(page.match(/Buscar por nombre, DNI o teléfono/g)).toHaveLength(1)
    expect(page).toContain("['all', 'Todos']")
    expect(page).toContain("['active', 'Activos']")
    expect(page).toContain("['expiring', 'Por vencer']")
    expect(page).toContain("['paused', 'En pausa']")
    expect(page).toContain("['inactive', 'Inactivos']")
  })

  it('removes the dashboard cards, charts, alerts, and access-code controls', () => {
    const page = source('app/admin/alumnos/page.tsx')

    expect(page).not.toContain('AdminStatCard')
    expect(page).not.toContain('AdminDonutChart')
    expect(page).not.toContain('SideAlert')
    expect(page).not.toContain('QuickAction')
    expect(page).not.toContain('revealedAccessStudentId')
  })

  it('keeps explicit loading, empty, and retryable error states', () => {
    const page = source('app/admin/alumnos/page.tsx')

    expect(page).toContain('StudentListSkeleton')
    expect(page).toContain('No encontramos alumnos con estos filtros.')
    expect(page).toContain('No pudimos cargar los alumnos.')
    expect(page).toContain('Reintentar')
  })
})
