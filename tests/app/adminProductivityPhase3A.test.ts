import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin productivity phase 3A', () => {
  it('adds shared operational components for status badges, empty states and session cards', () => {
    const components = source('components/admin/AdminOperationalComponents.tsx')

    expect(components).toContain('export function OperationalStatusBadge')
    expect(components).toContain('export function EmptyOperationalState')
    expect(components).toContain('export function AdminSessionAccordion')
    expect(components).toContain('export function AttendanceSessionTabs')
    expect(components).toContain('export function AttendanceStudentRow')
  })

  it('renders sessions as compact expandable operational cards with attendance links', () => {
    const sessions = source('app/admin/sesiones/page.tsx')
    const components = source('components/admin/AdminOperationalComponents.tsx')
    const sessionUi = `${sessions}\n${components}`

    expect(sessionUi).toContain('AdminSessionAccordion')
    expect(sessionUi).toContain('occupancyStatus')
    expect(sessionUi).toContain('Pasar asistencia')
    expect(sessionUi).toContain('/admin/asistencia?date=')
    expect(sessionUi).toContain('Cancelar con reembolso')
    expect(sessionUi).toContain('Cancelar sin reembolso')
    expect(sessionUi).not.toContain('<table')
  })

  it('adds quick date filters, session tabs and operational attendance states', () => {
    const asistencia = source('app/admin/asistencia/page.tsx')
    const components = source('components/admin/AdminOperationalComponents.tsx')
    const attendanceUi = `${asistencia}\n${components}`

    expect(attendanceUi).toContain('Hoy')
    expect(attendanceUi).toContain('Manana')
    expect(attendanceUi).toContain('Proximos turnos')
    expect(attendanceUi).toContain('AttendanceSessionTabs')
    expect(attendanceUi).toContain('AttendanceStudentRow')
    expect(attendanceUi).toContain('Faltan')
    expect(attendanceUi).toContain('Asistencia completa')
    expect(attendanceUi).toContain('sessionId')
    expect(attendanceUi).not.toContain('alert(')
  })
})
