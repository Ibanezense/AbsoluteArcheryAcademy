import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin multiple membership cycles', () => {
  it('offers paid and gift cycle inputs with an operational preview', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('Membresia pagada')
    expect(page).toContain('Obsequio')
    expect(page).toContain('Cantidad de periodos')
    expect(page).toContain('Vista previa')
    expect(page).toContain('min={1}')
    expect(page).toContain('max={12}')
    expect(page).toContain('gift_classes')
    expect(page).toContain('gift_end_date')
    expect(page).toContain('payment_type')
  })

  it('uses shared cycle calculations and the transactional assignment service', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain("from '@/lib/utils/membershipCycles'")
    expect(page).toContain('buildMembershipCyclePreview')
    expect(page).toContain('suggestNextMembershipStart')
    expect(page).toContain('summarizeMemberships')
    expect(page).toContain("from '@/lib/services/adminMembershipService'")
    expect(page).toContain('createStudentMembershipCycles(supabase,')
    expect(page).not.toContain("supabase.rpc('admin_assign_membership_plan'")
  })

  it('keeps assignment idempotent and refreshes every affected admin cache', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('assignmentIdempotencyKeyRef')
    expect(page).toContain('studentKeys.all')
    expect(page).toContain('membershipPlanKeys.all')
    expect(page).toContain("['admin-students']")
    expect(page).toContain("['admin-bookings']")
    expect(page).toContain("['weekly-attendance-review']")
    expect(page).toContain('await refreshAll()')
  })

  it('labels independent FIFO cycles without replacement messaging', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('En consumo')
    expect(page).toContain('Programada')
    expect(page).toContain('En espera')
    expect(page).toContain('membership_origin')
    expect(page).not.toContain('replacementWarning')
    expect(page).not.toContain('pasa a historial')
    expect(page).not.toContain('pasara al historial')
    expect(page).not.toContain('Advertencia de reemplazo')
  })

  it('loads membership origin and assignment batch fields', () => {
    const hook = source('lib/hooks/useMembershipPlans.ts')

    expect(hook).toContain("membership_origin: 'paid' | 'gift'")
    expect(hook).toContain('assignment_batch_id: string | null')
    expect(hook).toMatch(/studentMembershipSelect[\s\S]*membership_origin,[\s\S]*assignment_batch_id,/)
    expect(hook).toContain('membership_origin: row.membership_origin')
    expect(hook).toContain('assignment_batch_id: row.assignment_batch_id')
  })
})
