import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  join(process.cwd(), 'app', 'admin', 'alumnos', '[id]', 'page.tsx'),
  'utf8',
)

describe('admin student attendance reversal surface', () => {
  it('shows the membership month and one unified reversal action for no-shows', () => {
    expect(page).toContain('Membresía')
    expect(page).toContain('formatAttendanceMembershipMonth')
    expect(page).toContain('Revertir inasistencia')
    expect(page).toMatch(/booking\.status === 'no_show'[\s\S]*Revertir inasistencia/)
  })

  it('requires an administrative reason and calls the idempotent service', () => {
    expect(page).toContain('Motivo de la reversión')
    expect(page).toContain('reverseStudentNoShow')
    expect(page).toContain('crypto.randomUUID()')
    expect(page).toContain('reason.trim()')
  })

  it('refreshes attendance, membership and operational views after success', () => {
    expect(page).toContain("queryKey: ['weekly-attendance-review']")
    expect(page).toContain("queryKey: ['admin-dashboard-operational']")
    expect(page).toContain("queryKey: ['admin-bookings']")
    expect(page).toContain('refreshStudentData()')
  })
})
