'use client'

import { Headphones, RefreshCw } from 'lucide-react'
import { useStudentPendingRenewal } from '@/lib/hooks/useMembershipRenewal'
import { openMembershipRenewalPrompt } from '@/lib/utils/membershipRenewal'

import { STUDENT_SUPPORT_URL } from '@/lib/utils/studentSupport'
export { STUDENT_SUPPORT_URL } from '@/lib/utils/studentSupport'

export default function StudentRenewalActions({ studentId, className = '' }: { studentId: string; className?: string }) {
  const pending = useStudentPendingRenewal(studentId)

  return (
    <section id="renovacion" aria-label="Renovación y soporte" className={`scroll-mt-24 rounded-2xl border border-line bg-white p-4 ${className}`}>
      <h2 className="font-bold text-textpri">Renovación y ayuda</h2>
      <p className="mt-1 text-sm text-textsec" role="status">
        {pending.isLoading ? 'Consultando solicitudes…' : pending.error ? 'No pudimos consultar el estado de tu renovación.' : pending.data?.status === 'pending_validation' ? 'Tu renovación está pendiente de validación por la academia.' : pending.data ? 'Tienes una renovación pendiente de pago.' : 'Consulta los planes y solicita tu siguiente membresía.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={openMembershipRenewalPrompt} className="btn-outline min-h-[44px] flex-1">
          <RefreshCw className="h-4 w-4" />{pending.data ? 'Ver renovación' : 'Renovar membresía'}
        </button>
        <a href={STUDENT_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="btn-outline min-h-[44px] flex-1" aria-label="Soporte por WhatsApp (abre una pestaña nueva)">
          <Headphones className="h-4 w-4" />Soporte
        </a>
        {pending.error && <button type="button" className="text-sm font-semibold text-accent" onClick={() => void pending.refetch()}>Reintentar consulta</button>}
      </div>
    </section>
  )
}
