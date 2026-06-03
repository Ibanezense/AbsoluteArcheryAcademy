import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin visual system', () => {
  it('provides shared admin visual primitives for page headers, panels and metric cards', () => {
    const system = source('components/admin/AdminVisualSystem.tsx')

    expect(system).toContain('export function AdminPageHeader')
    expect(system).toContain('export function AdminStatCard')
    expect(system).toContain('export function AdminContentPanel')
    expect(system).toContain('export function AdminSparkline')
    expect(system).toContain('ResponsiveContainer')
    expect(system).toContain('BarChart')
    expect(system).toContain('PieChart')
    expect(system).toContain('export function AdminDonutChart')
  })

  it('uses the shared admin header across the main admin sections', () => {
    for (const path of [
      'app/admin/page.tsx',
      'app/admin/alumnos/page.tsx',
      'app/admin/asistencia/page.tsx',
      'app/admin/membresias/page.tsx',
      'app/admin/sesiones/page.tsx',
      'app/admin/finanzas/page.tsx',
      'app/admin/intro/page.tsx',
    ]) {
      expect(source(path)).toContain('AdminPageHeader')
    }
  })

  it('matches the alumnos operational layout with student cards and a right sidebar', () => {
    const alumnos = source('app/admin/alumnos/page.tsx')

    expect(alumnos).toContain('admin-students-grid')
    expect(alumnos).toContain('Alertas operativas')
    expect(alumnos).toContain('Proximas clases hoy')
    expect(alumnos).toContain('Distribucion por nivel')
    expect(alumnos).toContain('Acciones rapidas')
  })

  it('uses contained bar charts and donut charts instead of overflowing line sparklines', () => {
    const dashboard = source('app/admin/page.tsx')
    const alumnos = source('app/admin/alumnos/page.tsx')

    expect(dashboard).toContain('AdminMiniBarChart')
    expect(dashboard).toContain('StudentsLevelDistribution')
    expect(dashboard).toContain('AdminDonutChart')
    expect(alumnos).toContain('AdminMiniBarChart')
    expect(alumnos).toContain('AdminDonutChart')
    expect(dashboard).not.toContain('function StatSparkline')
  })
})
