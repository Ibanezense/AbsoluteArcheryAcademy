import React from 'react'
import { MessageCircle } from 'lucide-react'
import type { MembershipRenewalAlert } from '@/lib/services/membershipRenewalAlertService'
import { buildMembershipRenewalWhatsAppUrl } from '@/lib/utils/membershipRenewalWhatsApp'

type MembershipRenewalAlertActionProps = {
  studentName: string
  phone: string | null | undefined
  alert: MembershipRenewalAlert | null | undefined
  className?: string
}

const presentation = {
  last_class: {
    label: 'Última clase',
    ariaState: 'última clase',
    containerClass: 'border-amber-200 bg-amber-50',
    labelClass: 'bg-amber-100 text-amber-800',
    buttonClass: 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100',
  },
  expired: {
    label: 'Membresía vencida',
    ariaState: 'membresía vencida',
    containerClass: 'border-rose-200 bg-rose-50',
    labelClass: 'bg-rose-100 text-rose-800',
    buttonClass: 'border-rose-300 bg-white text-rose-800 hover:bg-rose-100',
  },
} as const

export function MembershipRenewalAlertAction({
  studentName,
  phone,
  alert,
  className = '',
}: MembershipRenewalAlertActionProps) {
  if (!alert || alert.alert_state === 'none') return null

  const statePresentation = presentation[alert.alert_state]
  const whatsappUrl = buildMembershipRenewalWhatsAppUrl(phone, alert.alert_state)

  return (
    <div className={`rounded-2xl border p-3 ${statePresentation.containerClass} ${className}`}>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${statePresentation.labelClass}`}>
        {statePresentation.label}
      </span>
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Enviar aviso de ${statePresentation.ariaState} a ${studentName} por WhatsApp`}
          className={`mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${statePresentation.buttonClass}`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Enviar WhatsApp
        </a>
      ) : (
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
          Registra un teléfono para enviar el aviso
        </p>
      )}
    </div>
  )
}
