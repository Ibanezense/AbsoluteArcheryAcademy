import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MembershipExpiryExtensionModal } from '@/components/admin/MembershipExpiryExtensionModal'
import type { MembershipExpiryExtensionPreview } from '@/lib/services/adminMembershipExpiryExtensionService'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const preview: MembershipExpiryExtensionPreview = {
  affected_count: 1,
  extensions: [
    {
      student_id: 'student-1',
      student_name: 'Ana Arquera',
      membership_id: 'membership-1',
      membership_name: 'Plan mensual',
      current_end_date: '2026-08-31',
      new_end_date: '2026-09-07',
    },
  ],
}

function renderModal(
  overrides: Partial<Parameters<typeof MembershipExpiryExtensionModal>[0]> = {},
) {
  return renderToStaticMarkup(createElement(MembershipExpiryExtensionModal, {
    isOpen: true,
    preview,
    reason: 'Cierre institucional',
    isLoading: false,
    isApplying: false,
    confirmOpen: false,
    error: null,
    onReasonChange: vi.fn(),
    onCancel: vi.fn(),
    onApply: vi.fn(),
    ...overrides,
  }))
}

describe('bulk membership expiry extension modal', () => {
  it('renders an accessible explanation, affected total and old-to-new preview', () => {
    const html = renderModal()

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('Retrasar vencimientos 7 días')
    expect(html).toContain('exactamente 7 días')
    expect(html).toContain('1 membresía afectada')
    expect(html).toContain('Ana Arquera')
    expect(html).toContain('Plan mensual')
    expect(html).toContain('2026-08-31')
    expect(html).toContain('2026-09-07')
    expect(html).toContain('→')
  })

  it('renders the required reason and both actions', () => {
    const html = renderModal()

    expect(html).toContain('<textarea')
    expect(html).toContain('required=""')
    expect(html).toContain('Motivo obligatorio')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Aplicar retraso de 7 días')
  })

  it.each([
    { reason: '   ' },
    { preview: { affected_count: 0, extensions: [] } },
    { isLoading: true },
    { isApplying: true },
  ])('disables confirmation for an ineligible state (%j)', (overrides) => {
    const html = renderModal(overrides)
    const applyButton = html.match(/<button[^>]*>Aplicar retraso de 7 días<\/button>/)?.[0]

    expect(applyButton).toContain('disabled=""')
  })

  it('announces busy state and renders preview loading and empty states', () => {
    expect(renderModal({ isApplying: true })).toContain('aria-busy="true"')
    expect(renderModal({ isLoading: true })).toContain('Preparando vista previa')
    expect(renderModal({ preview: { affected_count: 0, extensions: [] } })).toContain(
      'No hay membresías elegibles',
    )
  })

  it('moves, traps and restores keyboard focus while the dialog is open', () => {
    const modal = source('components/admin/MembershipExpiryExtensionModal.tsx')

    expect(modal).toContain('dialogRef.current?.focus()')
    expect(modal).toContain("event.key !== 'Tab'")
    expect(modal).toContain('previousActiveElementRef.current = document.activeElement')
    expect(modal).toContain('previousActiveElementRef.current?.focus()')
    expect(modal).toContain('tabIndex={-1}')
  })

  it('keeps focus containment installed while apply is busy unless the stacked confirm is open', () => {
    const modal = source('components/admin/MembershipExpiryExtensionModal.tsx')
    const page = source('app/admin/membresias/page.tsx')

    expect(modal).toContain('confirmOpen: boolean')
    expect(modal).toContain('if (!isOpen || confirmOpen) return')
    expect(modal).not.toContain('if (!isOpen || isApplying) return')
    expect(modal).toContain('}, [confirmOpen, isOpen])')
    expect(page).toContain('confirmOpen={expiryExtensionConfirming}')
  })

  it('hides and inerts the lower modal while the stacked confirmation is exposed', () => {
    const html = renderModal({ confirmOpen: true, isApplying: true })

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('inert=""')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('aria-modal="true"')
  })
})

describe('bulk membership expiry extension page integration', () => {
  it('loads a preview from the header action and applies with a stable UUID and reason', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('Retrasar vencimientos 7 días')
    expect(page).toContain('MembershipExpiryExtensionModal')
    expect(page).toContain('previewBulkMembershipExpiryExtension(supabase)')
    expect(page).toContain('applyBulkMembershipExpiryExtension(supabase, {')
    expect(page).toContain('reason: expiryExtensionReason')
    expect(page).toContain('idempotencyKey: expiryExtensionIdempotencyKeyRef.current')
    expect(page).toContain('crypto.randomUUID()')
    expect(page).toContain('expiryExtensionSubmissionLockRef.current')
  })

  it('ignores stale preview responses after canceling or reopening the modal', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('expiryExtensionPreviewGenerationRef.current += 1')
    expect(page).toContain('const previewGeneration = expiryExtensionPreviewGenerationRef.current')
    expect(page).toContain('isExpiryExtensionPreviewCurrent(previewGeneration)')
  })

  it('aborts a confirmed apply after unmount or operation invalidation', () => {
    const page = source('app/admin/membresias/page.tsx')
    const applyHandler = page.slice(
      page.indexOf('async function applyExpiryExtension'),
      page.indexOf('function releaseAssignmentSubmissionLock'),
    )

    expect(page).toContain('expiryExtensionMountedRef.current = true')
    expect(page).toContain('expiryExtensionMountedRef.current = false')
    expect(page).toContain('expiryExtensionOperationGenerationRef.current += 1')
    expect(applyHandler).toMatch(
      /if \(\s*!expiryExtensionMountedRef\.current \|\|\s*expiryExtensionOperationGenerationRef\.current !== operationGeneration\s*\) return\s*const result = await applyBulkMembershipExpiryExtension/,
    )
  })

  it('does not update preview or reset state after unmount or async invalidation', () => {
    const page = source('app/admin/membresias/page.tsx')
    const applyHandler = page.slice(
      page.indexOf('async function applyExpiryExtension'),
      page.indexOf('function releaseAssignmentSubmissionLock'),
    )

    expect(page).toContain('expiryExtensionPreviewGenerationRef.current += 1')
    expect(page).toContain('function isExpiryExtensionPreviewCurrent(previewGeneration: number)')
    expect(page).toContain('if (!isExpiryExtensionPreviewCurrent(previewGeneration)) return')
    const refreshIndex = applyHandler.indexOf('await refreshAll(true)')
    const postRefreshGuardIndex = applyHandler.indexOf(
      '!expiryExtensionMountedRef.current',
      refreshIndex,
    )
    const resetIndex = applyHandler.indexOf('resetExpiryExtensionModal()', refreshIndex)
    expect(refreshIndex).toBeGreaterThan(-1)
    expect(postRefreshGuardIndex).toBeGreaterThan(refreshIndex)
    expect(resetIndex).toBeGreaterThan(postRefreshGuardIndex)
  })

  it('always invalidates global caches after a successful RPC before checking mounted UI state', () => {
    const page = source('app/admin/membresias/page.tsx')
    const applyHandler = page.slice(
      page.indexOf('async function applyExpiryExtension'),
      page.indexOf('function releaseAssignmentSubmissionLock'),
    )
    const rpcIndex = applyHandler.indexOf('const result = await applyBulkMembershipExpiryExtension')
    const invalidationIndex = applyHandler.indexOf('const invalidationResults = await Promise.allSettled')
    const postResponseGuardIndex = applyHandler.indexOf('!expiryExtensionMountedRef.current', rpcIndex)
    const successToastIndex = applyHandler.indexOf("type: 'success'", rpcIndex)
    const refreshIndex = applyHandler.indexOf('await refreshAll(true)', rpcIndex)

    expect(rpcIndex).toBeGreaterThan(-1)
    expect(invalidationIndex).toBeGreaterThan(rpcIndex)
    expect(postResponseGuardIndex).toBeGreaterThan(invalidationIndex)
    expect(successToastIndex).toBeGreaterThan(postResponseGuardIndex)
    expect(refreshIndex).toBeGreaterThan(postResponseGuardIndex)
    expect(applyHandler).toContain(
      'Los vencimientos se actualizaron, pero no se pudo refrescar toda la información.',
    )
    expect(applyHandler.match(/\{ throwOnError: true \}/g)).toHaveLength(7)
    expect(page).toContain('async function refreshAll(throwOnError = false)')
    expect(page).toContain('refetchPlans({ throwOnError })')
    expect(page).toContain('refetchMemberships({ throwOnError })')
    expect(page).toContain('refetchStudents({ throwOnError })')
    expect(applyHandler).toContain('await refreshAll(true)')
  })

  it('confirms before applying, reports the actual count and resets the modal', () => {
    const page = source('app/admin/membresias/page.tsx')
    const applyHandler = page.slice(
      page.indexOf('async function applyExpiryExtension'),
      page.indexOf('async function editMembership'),
    )

    expect(applyHandler.indexOf('await confirm(')).toBeGreaterThan(-1)
    expect(applyHandler.indexOf('applyBulkMembershipExpiryExtension')).toBeGreaterThan(
      applyHandler.indexOf('await confirm('),
    )
    expect(applyHandler).toContain('result.affected_count')
    expect(applyHandler).toContain("type: 'success'")
    expect(applyHandler).toContain("type: 'error'")
    expect(applyHandler).toContain('resetExpiryExtensionModal()')
  })

  it('keeps the existing confirmation dialog above the bulk-action modal', () => {
    const modal = source('components/admin/MembershipExpiryExtensionModal.tsx')
    const confirmDialog = source('components/ui/ConfirmDialog.tsx')

    expect(modal).toContain('fixed inset-0 z-40')
    expect(confirmDialog).toContain('fixed inset-0 z-50')
  })

  it('hands keyboard focus and tab containment to the confirmation dialog', () => {
    const page = source('app/admin/membresias/page.tsx')
    const modal = source('components/admin/MembershipExpiryExtensionModal.tsx')

    expect(page).toContain('const [expiryExtensionConfirming, setExpiryExtensionConfirming]')
    expect(page).toContain('requestAnimationFrame(focusConfirmationDialog)')
    expect(page).toContain("if (event.key !== 'Tab') return")
    expect(page).toContain("querySelectorAll<HTMLElement>('[role=\"dialog\"][aria-modal=\"true\"]')")
    expect(modal).toContain('}, [confirmOpen, isOpen])')
  })

  it('guards pending submissions and refreshes all affected query families', () => {
    const page = source('app/admin/membresias/page.tsx')

    expect(page).toContain('if (expiryExtensionSubmissionLockRef.current) return')
    expect(page).toContain('queryKey: membershipPlanKeys.all')
    expect(page).toContain('queryKey: studentKeys.all')
    expect(page).toContain('queryKey: membershipRenewalAlertKeys.all')
    expect(page).toContain("queryKey: ['admin-students']")
    expect(page).toContain("queryKey: ['admin-bookings']")
    expect(page).toContain("queryKey: ['weekly-attendance-review']")
    expect(page).toContain("queryKey: ['admin-dashboard-operational']")
    expect(page).toContain('await refreshAll()')
  })
})
