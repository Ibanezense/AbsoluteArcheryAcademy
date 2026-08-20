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

describe('student membership renewal prompt surface', () => {
  it('loads only the canonical alert for the active student', () => {
    expect(promptSource).toContain("from '@/lib/hooks/useMembershipRenewalAlerts'")
    expect(promptSource).toMatch(/useMembershipRenewalAlerts\(activeStudentId\s*\?\s*\[activeStudentId\]\s*:\s*\[\]\)/)
    expect(promptSource).toContain('alertsQuery.data?.[activeStudentId]')
    expect(promptSource).toContain("alert.alert_state === 'last_class'")
    expect(promptSource).toContain("alert.alert_state === 'expired'")
    expect(promptSource).toContain('alert.state_key')
    expect(promptSource).not.toContain('useStudentDashboard')
    expect(promptSource).not.toContain('dashboard')
  })

  it('uses the approved copy and a daily Lima localStorage key', () => {
    expect(promptSource).toContain('getRenewalPromptCopy(alert.alert_state)')
    expect(promptSource).toContain('getLimaRenewalDismissalKey(')
    expect(promptSource).toContain('window.localStorage.getItem(dismissalKey)')
    expect(promptSource).toContain("window.localStorage.setItem(dismissalKey, '1')")
    expect(promptSource).not.toContain('sessionStorage')
  })

  it('does not auto-open before context and alert queries are ready', () => {
    expect(promptSource).toContain("account?.role !== 'admin'")
    expect(promptSource).toContain('!contextLoading')
    expect(promptSource).toContain('!alertsQuery.isLoading')
    expect(promptSource).toContain('!alertsQuery.error')
    expect(promptSource).toContain('!!dismissalKey')
    expect(promptSource).toContain('!!alert')
  })

  it('keeps the manual event and renewal request flow for an active alert', () => {
    expect(promptSource).toContain('OPEN_MEMBERSHIP_RENEWAL_EVENT')
    expect(promptSource).toContain('setManualOpen(true)')
    expect(promptSource).toContain('useMembershipRenewalOptions')
    expect(promptSource).toContain('useRequestMembershipRenewal')
    expect(promptSource).toContain('setSubmitted(true)')
  })

  it('normalizes malformed option data defensively and renders query errors locally', () => {
    expect(promptSource).toContain('Array.isArray(optionsQuery.data)')
    expect(promptSource).toContain('normalizeRenewalOptions(rawOptions)')
    expect(promptSource).toContain('optionsQuery.error')
    expect(promptSource).toContain('No se pudieron cargar los planes de renovacion.')
  })

  it('remains mounted on student routes without legacy dashboard inference', () => {
    expect(layoutSource).toContain('{showStudentNav && <MembershipRenewalPrompt />}')
    expect(renewalHelpersSource).not.toContain('RenewalPromptState')
    expect(renewalHelpersSource).not.toContain('legacy dashboard')
  })
})
