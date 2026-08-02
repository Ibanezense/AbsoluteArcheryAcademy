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
    expect(hook).toContain('reservedByMembershipId')
    expect(hook).toContain('booking.active_membership_id')
    expect(page).not.toContain('const reservedByMembershipId')
    expect(hook).toContain('summarizeMemberships')
    expect(query).toContain("rpc('get_admin_membership_reservation_commitments',")
    expect(query).toContain('{ p_student_id: null }')
    expect(query).toContain('normalizeMembershipCommitments')
    expect(query).not.toContain(".select('student_id,active_membership_id')")
  })

  it('loads detail commitments through the single-payload RPC outside booking history', () => {
    const hook = source('lib/hooks/useStudentDetail.ts')

    expect(hook).toContain("rpc('get_admin_membership_reservation_commitments', { p_student_id: studentId })")
    expect(hook).toContain('commitmentsError')
    expect(hook).toContain('normalizeMembershipCommitments')
    expect(hook).not.toMatch(/select\('active_membership_id'\)[\s\S]*eq\('status', 'reserved'\)/)
  })

  it('loads future reserved bookings independently from the 250-row history window', () => {
    const hook = source('lib/hooks/useStudentDetail.ts')

    expect(hook).toContain('upcomingBookingsError')
    expect(hook).toMatch(/from\('bookings'\)[\s\S]*sessions!inner\(start_at,end_at\)[\s\S]*eq\('status', 'reserved'\)[\s\S]*gt\('sessions\.start_at'/)
    expect(hook).toContain('bookingsById')
    expect(hook).toContain('upcomingBookings || []')
    expect(hook).toContain('if (upcomingBookingsError) throw upcomingBookingsError')
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
    expect(page).toContain('available_classes_by_id')
    expect(page).toContain('libres de')
    expect(page).toContain('useMemo')
  })

  it('refreshes the Lima service date and consumes the summary from the detail hook', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain('useLimaBoundaryClock')
    expect(page).toContain('setTimeout')
    expect(page).toContain('clearTimeout')
    expect(page).not.toContain('setInterval')
    expect(page).toContain('serviceDate')
    expect(page).not.toContain('const reservedByMembershipId = useMemo')
  })

  it('uses the shared corrective deletion flow from student detail', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')
    const deleteBlock = page.slice(
      page.indexOf('async function handleDeleteMembership'),
      page.indexOf('if (isLoading)'),
    )

    expect(deleteBlock.indexOf("supabase.rpc('admin_get_membership_deletion_preview'")).toBeLessThan(
      deleteBlock.indexOf('await confirm('),
    )
    expect(deleteBlock.indexOf('await confirm(')).toBeLessThan(
      deleteBlock.indexOf("supabase.rpc('admin_delete_student_membership'"),
    )
    expect(deleteBlock).toContain('parseMembershipDeletionPreview')
    expect(deleteBlock).toContain('parseMembershipDeletionResult')
    expect(deleteBlock).toContain('buildMembershipDeletionConfirmation')
    expect(deleteBlock).toContain('formatMembershipDeletionSuccess')
    expect(deleteBlock).toContain('membershipDeletionLockRef')
    expect(page).toContain('Esta accion es irreversible.')
    expect(page).toContain('Eliminar membresia')
    expect(page).toContain('membershipPreviewingId')
    expect(page).not.toContain('canDeleteExpiredMembership')
  })

  it('invalidates all real membership correction consumers from student detail', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')
    const deleteBlock = page.slice(
      page.indexOf('async function handleDeleteMembership'),
      page.indexOf('if (isLoading)'),
    )

    for (const queryKey of [
      "queryKey: ['admin-dashboard-operational']",
      "queryKey: ['admin-student-search']",
      "queryKey: ['admin-membership-renewal-requests']",
      "queryKey: ['admin-students']",
      "queryKey: ['admin-bookings']",
      "queryKey: ['weekly-attendance-review']",
    ]) {
      expect(deleteBlock).toContain(queryKey)
    }
    expect(deleteBlock).toContain('membershipPlanKeys.all')
    expect(deleteBlock).toContain('studentKeys.all')
  })
})
