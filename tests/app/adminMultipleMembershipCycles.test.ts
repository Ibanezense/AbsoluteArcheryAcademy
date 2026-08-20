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
    expect(page).toContain('assignmentSubmissionLockRef')
    expect(page).toContain('if (assignmentSubmissionLockRef.current) return')
    expect(page.indexOf('assignmentSubmissionLockRef.current = true')).toBeLessThan(
      page.indexOf('await confirm(confirmMessage'),
    )
    expect(page).toContain('releaseAssignmentSubmissionLock')
    expect(page).toContain('studentKeys.all')
    expect(page).toContain('membershipPlanKeys.all')
    expect(page).toContain("['admin-students']")
    expect(page).toContain("['admin-bookings']")
    expect(page).toContain("['weekly-attendance-review']")
    expect(page).toContain('await refreshAll()')
  })

  it('validates paid and gift values before opening confirmation', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('validateAssignmentForm')
    expect(page).toContain('La cantidad de periodos debe ser un entero entre 1 y 12.')
    expect(page).toContain('El descuento debe ser un numero mayor o igual a cero.')
    expect(page).toContain('El descuento porcentual no puede superar 100%.')
    expect(page).toContain('El pago total debe ser un numero mayor o igual a cero.')
    expect(page).toContain('Las clases de obsequio deben ser un entero positivo.')
    expect(page).toContain('La fecha final del obsequio no puede ser anterior al inicio.')
    expect(page.indexOf('validateAssignmentForm(')).toBeLessThan(
      page.indexOf('await confirm(confirmMessage'),
    )
  })

  it('locks form controls and exposes pressed state for the origin selector', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('assignmentSubmissionLocked')
    expect(page).toContain('disabled={isSaving}')
    expect(page).toContain('aria-pressed={form.origin === origin}')
    expect(page).toContain("role=\"group\"")
  })

  it('forces paid mode in shortcuts and rejects orphan renewals', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain("origin: 'paid'")
    expect(page).toContain("patchAssignmentForm({ origin: 'paid', student_id: student.id })")
    expect(page).toContain("patchAssignmentForm({ origin: 'paid', membership_plan_id: plan.id })")
    expect(page).toContain('No se puede renovar una membresia sin alumno asociado.')
    expect(page).toContain('if (!student)')
    expect(page).not.toContain("membership.student?.id || current.student_id")
  })

  it('invalidates attendance and booking views after edit and delete mutations', () => {
    const page = source('app/admin/membresias/page.tsx')
    const saveBlock = page.slice(
      page.indexOf('async function saveMembershipEditor'),
      page.indexOf('async function deleteMembership'),
    )
    const deleteBlock = page.slice(
      page.indexOf('async function deleteMembership'),
      page.indexOf('async function savePlanEditor'),
    )

    for (const block of [saveBlock, deleteBlock]) {
      expect(block).toContain("['admin-students']")
      expect(block).toContain("['admin-bookings']")
      expect(block).toContain("['weekly-attendance-review']")
      expect(block).toContain('studentKeys.all')
      expect(block).toContain('membershipPlanKeys.all')
      expect(block).toContain('membershipRenewalAlertKeys.all')
      expect(block).toContain('await refreshAll()')
    }
  })

  it('invalidates canonical renewal alerts after assigning membership cycles', () => {
    const page = source('app/admin/membresias/page.tsx')
    const assignmentBlock = page.slice(
      page.indexOf('async function assignMembership'),
      page.indexOf('async function saveMembershipEditor'),
    )

    expect(page).toContain("import { membershipRenewalAlertKeys } from '@/lib/hooks/useMembershipRenewalAlerts'")
    expect(assignmentBlock).toContain('membershipRenewalAlertKeys.all')
  })

  it('previews corrective deletion before confirmation and prevents duplicate requests', () => {
    const page = source('app/admin/membresias/page.tsx')
    const deleteBlock = page.slice(
      page.indexOf('async function deleteMembership'),
      page.indexOf('async function savePlanEditor'),
    )

    expect(deleteBlock.indexOf("supabase.rpc('admin_get_membership_deletion_preview'")).toBeLessThan(
      deleteBlock.indexOf('await confirm('),
    )
    expect(deleteBlock.indexOf('await confirm(')).toBeLessThan(
      deleteBlock.indexOf("supabase.rpc('admin_delete_student_membership'"),
    )
    expect(deleteBlock).toContain('if (previewError)')
    expect(deleteBlock).toContain('if (!previewData.can_delete)')
    expect(deleteBlock).toContain('if (!deleteData?.success)')
    expect(deleteBlock).toContain('parseMembershipDeletionPreview')
    expect(deleteBlock).toContain('parseMembershipDeletionResult')
    expect(deleteBlock).toContain('membershipPreviewingId')
    expect(deleteBlock).toContain('membershipDeletingId')
    expect(page).toContain('disabled={isSaving || isPreviewing || isDeleting}')
    expect(deleteBlock).toContain("queryKey: ['admin-dashboard-operational']")
    expect(deleteBlock).toContain("queryKey: ['admin-student-search']")
    expect(deleteBlock).toContain("queryKey: ['admin-membership-renewal-requests']")
  })

  it('precomputes display statuses instead of summarizing inside every row', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('membershipStatusesById')
    expect(page).toContain('useMemo')
    expect(page).not.toContain('function cycleDisplayStatus')
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
