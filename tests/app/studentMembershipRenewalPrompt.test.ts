import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const promptSource = readFileSync(
  join(process.cwd(), 'components', 'MembershipRenewalPrompt.tsx'),
  'utf8',
)
const layoutSource = readFileSync(
  join(process.cwd(), 'app', 'LayoutWrapper.tsx'),
  'utf8',
)
const renewalHelpersSource = readFileSync(
  join(process.cwd(), 'lib', 'utils', 'membershipRenewal.ts'),
  'utf8',
)
const alertsHookSource = readFileSync(
  join(process.cwd(), 'lib', 'hooks', 'useMembershipRenewalAlerts.ts'),
  'utf8',
)
const boundarySource = readFileSync(
  join(process.cwd(), 'components', 'MembershipRenewalPromptBoundary.tsx'),
  'utf8',
)
const modalSource = readFileSync(
  join(process.cwd(), 'components', 'ui', 'Modal.tsx'),
  'utf8',
)

describe('student membership renewal prompt surface', () => {
  it('loads only the canonical alert for the active student', () => {
    expect(promptSource).toContain("from '@/lib/hooks/useMembershipRenewalAlerts'")
    expect(promptSource).toMatch(/useMembershipRenewalAlerts\(activeStudentId\s*\?\s*\[activeStudentId\]\s*:\s*\[\]\)/)
    expect(promptSource).toContain('alertsQuery.data?.[activeStudentId]')
    expect(promptSource).toContain('getVisibleRenewalAlert(alert)')
    expect(promptSource).not.toContain('useStudentDashboard')
    expect(promptSource).not.toContain('dashboard')
  })

  it('uses the approved copy and a daily Lima localStorage key', () => {
    expect(promptSource).toContain('getRenewalPromptCopy(visibleAlert.alert_state)')
    expect(promptSource).toContain('getLimaRenewalDismissalKey(')
    expect(promptSource).toContain('getDismissedRenewalPrompt(() => window.localStorage, dismissalKey)')
    expect(promptSource).toContain('setDismissedRenewalPrompt(() => window.localStorage, dismissalKey)')
    expect(promptSource).not.toContain('sessionStorage')
  })

  it('does not auto-open before context and alert queries are ready', () => {
    expect(promptSource).toContain('shouldOpenMembershipRenewalPrompt({')
    expect(promptSource).toContain('contextReady: !!activeStudentId && !contextLoading')
    expect(promptSource).toContain('queryReady: !alertsQuery.isLoading && !alertsQuery.error')
    expect(promptSource).toContain("isAdmin: account?.role === 'admin'")
    expect(promptSource).toContain('alert: visibleAlert')
    expect(promptSource).toContain('checkedDismissalKey')
  })

  it('keeps the manual event and renewal request flow for an active alert', () => {
    expect(promptSource).toContain('OPEN_MEMBERSHIP_RENEWAL_EVENT')
    expect(promptSource).toContain('setManualOpen(true)')
    expect(promptSource).toContain('useMembershipRenewalOptions')
    expect(promptSource).toContain('useRequestMembershipRenewal')
    expect(promptSource).toContain('setSubmitted(true)')
  })

  it('normalizes malformed option data defensively and renders query errors locally', () => {
    expect(promptSource).toContain('getValidatedRenewalOptions(optionsQuery.data)')
    expect(promptSource).toContain('normalizeRenewalOptions(validatedOptions)')
    expect(promptSource).toContain('optionsQuery.error')
    expect(promptSource).toContain('No se pudieron cargar los planes de renovacion.')
  })

  it('remains mounted on student routes without legacy dashboard inference', () => {
    expect(layoutSource).toContain('<MembershipRenewalPromptBoundary key={pathname}>')
    expect(layoutSource).toContain('<MembershipRenewalPrompt />')
    expect(boundarySource).toContain('getDerivedStateFromError')
    expect(boundarySource).toContain('return null')
    expect(renewalHelpersSource).not.toContain('RenewalPromptState')
    expect(renewalHelpersSource).not.toContain('legacy dashboard')
  })

  it('refreshes canonical data and the Lima day after a PWA resume', () => {
    expect(alertsHookSource).toContain('refetchOnWindowFocus: true')
    expect(alertsHookSource).toContain('refetchOnReconnect: true')
    expect(promptSource).toContain("document.addEventListener('visibilitychange', refreshRenewalClock)")
    expect(promptSource).toContain("window.addEventListener('pageshow', refreshRenewalClock)")
    expect(promptSource).toContain('renewalClock')
  })

  it('keeps plan selection and the shared modal accessible', () => {
    expect(promptSource).toContain('aria-pressed={selected}')
    expect(modalSource).toContain('role="dialog"')
    expect(modalSource).toContain('aria-modal="true"')
    expect(modalSource).toContain('aria-labelledby={titleId}')
    expect(modalSource).toContain("event.key === 'Escape'")
  })
})
