import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin student membership queue', () => {
  it('loads aggregate list balances without replacing the current FIFO balance', () => {
    const query = source('lib/queries/studentQueries.ts')

    expect(query).toContain('total_open_classes: number')
    expect(query).toContain('open_membership_count: number')
    expect(query).toContain("from '@/lib/utils/membershipCycles'")
    expect(query).toContain('summarizeMemberships')
    expect(query).toMatch(/memberships:student_memberships \([\s\S]*id,[\s\S]*classes_total,[\s\S]*membership_origin,/)
  })

  it('shows the aggregate wording only when several memberships are open', () => {
    const page = source('app/admin/alumnos/page.tsx')

    expect(page).toContain('open_membership_count > 1')
    expect(page).toContain('total_open_classes')
    expect(page).toContain('clases en')
    expect(page).toContain('membresías')
  })

  it('derives the detail current membership and open totals through FIFO summary', () => {
    const hook = source('lib/hooks/useStudentDetail.ts')

    expect(hook).toContain("membership_origin: 'paid' | 'gift'")
    expect(hook).toContain('assignment_batch_id: string | null')
    expect(hook).toContain('total_open_classes: number')
    expect(hook).toContain('open_membership_count: number')
    expect(hook).toContain('summarizeMemberships')
    expect(hook).toContain('currentMembershipId')
  })

  it('attributes reserved bookings to their concrete membership', () => {
    const query = source('lib/queries/studentQueries.ts')
    const hook = source('lib/hooks/useStudentDetail.ts')
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(hook).toContain('active_membership_id: string | null')
    expect(hook).toContain('active_membership_id,')
    expect(page).toContain('reservedByMembershipId')
    expect(page).toContain('booking.active_membership_id')
    expect(page).toContain("booking.status !== 'reserved'")
    expect(page).toContain('summarizeMemberships')
    expect(query).toContain('active_membership_id')
  })

  it('uses the America/Lima business date on list, detail query, and detail UI', () => {
    const query = source('lib/queries/studentQueries.ts')
    const hook = source('lib/hooks/useStudentDetail.ts')
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(query).toContain('getLimaDateKey')
    expect(hook).toContain('getLimaDateKey')
    expect(page).toContain('getLimaDateKey')
    expect(query).not.toContain('new Date().toISOString().slice(0, 10)')
    expect(hook).not.toContain('new Date().toISOString().slice(0, 10)')
    expect(page).not.toContain('new Date().toISOString().slice(0, 10)')
  })

  it('renders total and current balances plus each cycle queue status', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('Total abierto')
    expect(page).toContain('Utilizable hoy')
    expect(page).toContain('En consumo')
    expect(page).toContain('Programada')
    expect(page).toContain('En espera')
    expect(page).toContain('Obsequio')
    expect(page).toContain('Pagada')
    expect(page).toContain('membershipStatusesById')
    expect(page).toContain('useMemo')
  })
})
