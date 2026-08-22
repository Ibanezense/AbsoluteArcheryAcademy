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
    expect(page).toContain('expiryExtensionPreviewGenerationRef.current !== previewGeneration')
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
    expect(page).toContain('await refreshAll()')
  })
})
