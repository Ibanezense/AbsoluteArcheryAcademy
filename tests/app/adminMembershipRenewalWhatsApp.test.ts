import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MembershipRenewalAlertAction,
} from '@/components/admin/MembershipRenewalAlertAction'
import type { MembershipRenewalAlert } from '@/lib/services/membershipRenewalAlertService'
import {
  LAST_CLASS_WHATSAPP_MESSAGE,
  buildMembershipRenewalWhatsAppUrl,
} from '@/lib/utils/membershipRenewalWhatsApp'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function alert(
  alertState: MembershipRenewalAlert['alert_state'],
): MembershipRenewalAlert {
  return {
    student_id: 'student-1',
    alert_state: alertState,
    remaining_unconsumed_classes: alertState === 'last_class' ? 1 : 0,
    has_current_membership: alertState === 'last_class',
    has_scheduled_membership: false,
    state_key: `${alertState}:student-1`,
  }
}

describe('admin membership renewal WhatsApp action', () => {
  it('renders the amber last-class action with the exact WhatsApp destination', () => {
    const html = renderToStaticMarkup(createElement(MembershipRenewalAlertAction, {
      studentName: 'Camila Ramella',
      phone: '999 999 999',
      alert: alert('last_class'),
    }))

    expect(html).toContain('Última clase')
    expect(html).toContain('border-amber-')
    expect(html).toContain('Enviar WhatsApp')
    expect(html).toContain('aria-label="Enviar aviso de última clase a Camila Ramella por WhatsApp"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
    expect(html).toContain(
      buildMembershipRenewalWhatsAppUrl('999 999 999', 'last_class'),
    )
    expect(decodeURIComponent(html)).toContain(LAST_CLASS_WHATSAPP_MESSAGE)
  })

  it('renders the red expired state without a broken link when phone is missing', () => {
    const html = renderToStaticMarkup(createElement(MembershipRenewalAlertAction, {
      studentName: 'Camila Ramella',
      phone: null,
      alert: alert('expired'),
    }))

    expect(html).toContain('Membresía vencida')
    expect(html).toContain('border-rose-')
    expect(html).toContain('Registra un teléfono para enviar el aviso')
    expect(html).not.toContain('href=')
  })

  it('renders no action for an absent or none alert', () => {
    const absentHtml = renderToStaticMarkup(createElement(MembershipRenewalAlertAction, {
      studentName: 'Camila Ramella',
      phone: '999999999',
      alert: undefined,
    }))
    const noneHtml = renderToStaticMarkup(createElement(MembershipRenewalAlertAction, {
      studentName: 'Camila Ramella',
      phone: '999999999',
      alert: alert('none'),
    }))

    expect(absentHtml).toBe('')
    expect(noneHtml).toBe('')
  })
})

describe('admin renewal alert integration', () => {
  it('loads one stable batch for all students and supplies alerts to desktop and mobile lists', () => {
    const page = source('app/admin/alumnos/page.tsx')

    expect(page).toContain("import { useMembershipRenewalAlerts } from '@/lib/hooks/useMembershipRenewalAlerts'")
    expect(page).toContain('const studentIds = useMemo(() => students.map((student) => student.id), [students])')
    expect(page).toContain('useMembershipRenewalAlerts(studentIds)')
    expect(page).toContain('<DesktopStudentTable students={filteredStudents} alerts={renewalAlerts} />')
    expect(page).toContain('<MobileStudentList students={filteredStudents} alerts={renewalAlerts} />')
    expect(page.match(/<MembershipRenewalAlertAction/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('loads and displays the shared action in the student detail', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')

    expect(page).toContain("import { MembershipRenewalAlertAction } from '@/components/admin/MembershipRenewalAlertAction'")
    expect(page).toContain('useMembershipRenewalAlerts([params.id])')
    expect(page).toContain('alert={renewalAlerts?.[data.id]}')
    expect(page).toContain('phone={data.phone}')
  })

  it('invalidates renewal alerts after membership updates, assignment, and deletion', () => {
    const page = source('app/admin/alumnos/[id]/page.tsx')
    const refreshBlock = page.slice(
      page.indexOf('async function refreshStudentData'),
      page.indexOf('async function uploadAvatar'),
    )
    const deleteBlock = page.slice(
      page.indexOf('async function handleDeleteMembership'),
      page.indexOf('function openMembershipEditor'),
    )

    expect(page).toContain('membershipRenewalAlertKeys.all')
    expect(refreshBlock).toContain('membershipRenewalAlertKeys.all')
    expect(deleteBlock).toContain('membershipRenewalAlertKeys.all')
  })
})
