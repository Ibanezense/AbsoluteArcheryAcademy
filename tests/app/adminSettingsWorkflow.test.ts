import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

describe('administrative settings workflow', () => {
  it('generates sessions only when requested from the sessions page', () => {
    expect(source('app/admin/ajustes/infraestructura/InfraestructuraClientPage.tsx')).not.toContain('generateSessionsMutation')
    expect(source('app/admin/sesiones/page.tsx')).toContain('useGenerateWeeklySessions')
  })
  it('links operational tools from their relevant pages', () => {
    expect(source('app/admin/alumnos/page.tsx')).toContain('/admin/alumnos/claves')
    expect(source('app/admin/asistencia/page.tsx')).toContain('/admin/asistencia/lista-ingreso')
  })
})
