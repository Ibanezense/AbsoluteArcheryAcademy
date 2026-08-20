'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/button'
import { useToast } from '@/components/ui/ToastProvider'
import { useMembershipRenewalAlerts } from '@/lib/hooks/useMembershipRenewalAlerts'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import {
  useMembershipRenewalOptions,
  useRequestMembershipRenewal,
  type MembershipRenewalOption,
} from '@/lib/hooks/useMembershipRenewal'
import {
  OPEN_MEMBERSHIP_RENEWAL_EVENT,
  formatSoles,
  getLimaRenewalDismissalKey,
  getRenewalPromptCopy,
  normalizeRenewalOptions,
} from '@/lib/utils/membershipRenewal'
import {
  getDismissedRenewalPrompt,
  getValidatedRenewalOptions,
  getVisibleRenewalAlert,
  setDismissedRenewalPrompt,
  shouldOpenMembershipRenewalPrompt,
} from '@/lib/utils/membershipRenewalPrompt'

const PAYMENT_LINES = [
  'Yape: 983883647 (Jose Carlos Ibanez)',
  'Plin: 971960351 (Kevin Ibanez Manchego)',
  'Cuenta Corriente Soles Interbank: 300-3007461459',
  'CCI Soles Interbank: 003-300-003007461459-12',
  'Cuenta Corriente Dolares Interbank: 300-3007461466',
  'CCI Dolares Interbank: 003-300-003007461466-17',
]

function PlanOption({
  option,
  selected,
  onSelect,
}: {
  option: MembershipRenewalOption
  selected: boolean
  onSelect: () => void
}) {
  const hasCountryClubDiscount = option.is_country_club_member
    && option.country_club_price !== null
    && option.country_club_price < option.regular_price

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border p-3 text-left transition ${
        selected ? 'border-accent bg-accent/10' : 'border-line bg-bg/40 hover:border-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-textpri">{option.classes_included} clases</p>
          {hasCountryClubDiscount && (
            <p className="mt-1 text-xs text-success">Precio afiliado Country Club</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-textpri">{formatSoles(option.effective_price)}</p>
          {hasCountryClubDiscount && (
            <p className="text-xs text-textsec line-through">{formatSoles(option.regular_price)}</p>
          )}
        </div>
      </div>
    </button>
  )
}

export default function MembershipRenewalPrompt() {
  const { account, activeStudentId, loading: contextLoading } = useStudentContext()
  const alertsQuery = useMembershipRenewalAlerts(activeStudentId ? [activeStudentId] : [])
  const alert = activeStudentId ? alertsQuery.data?.[activeStudentId] : undefined
  const visibleAlert = getVisibleRenewalAlert(alert)
  const [renewalClock, setRenewalClock] = useState(() => new Date())
  const dismissalKey = activeStudentId && visibleAlert
    ? getLimaRenewalDismissalKey(
      activeStudentId,
      visibleAlert.alert_state,
      visibleAlert.state_key,
      renewalClock,
    )
    : null
  const promptCopy = visibleAlert ? getRenewalPromptCopy(visibleAlert.alert_state) : null
  const [dismissed, setDismissed] = useState(false)
  const [checkedDismissalKey, setCheckedDismissalKey] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [submitted, setSubmitted] = useState(false)
  const toast = useToast()

  const isOpen = shouldOpenMembershipRenewalPrompt({
    contextReady: !!activeStudentId && !contextLoading,
    queryReady: !alertsQuery.isLoading && !alertsQuery.error,
    isAdmin: account?.role === 'admin',
    alert: visibleAlert,
    dismissalKey,
    checkedDismissalKey,
    dismissed,
    manualOpen,
  })
  const shouldLoadOptions = isOpen
  const optionsQuery = useMembershipRenewalOptions(activeStudentId, shouldLoadOptions)
  const requestMutation = useRequestMembershipRenewal()

  const { options: validatedOptions, malformed: optionsMalformed } = useMemo(
    () => getValidatedRenewalOptions(optionsQuery.data),
    [optionsQuery.data],
  )
  const options = useMemo(
    () => normalizeRenewalOptions(validatedOptions),
    [validatedOptions],
  )
  const selectedPlan = useMemo(
    () => options.find((option) => option.plan_id === selectedPlanId) || options[0] || null,
    [options, selectedPlanId]
  )

  useEffect(() => {
    if (!dismissalKey || typeof window === 'undefined') {
      setCheckedDismissalKey(null)
      setDismissed(false)
      return
    }

    setDismissed(getDismissedRenewalPrompt(() => window.localStorage, dismissalKey))
    setCheckedDismissalKey(dismissalKey)
    setManualOpen(false)
    setSubmitted(false)
    setSelectedPlanId('')
  }, [dismissalKey])

  useEffect(() => {
    function refreshRenewalClock() {
      if (document.visibilityState === 'hidden') return
      setRenewalClock(new Date())
    }

    document.addEventListener('visibilitychange', refreshRenewalClock)
    window.addEventListener('pageshow', refreshRenewalClock)
    window.addEventListener('focus', refreshRenewalClock)
    return () => {
      document.removeEventListener('visibilitychange', refreshRenewalClock)
      window.removeEventListener('pageshow', refreshRenewalClock)
      window.removeEventListener('focus', refreshRenewalClock)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function handleManualOpen() {
      if (!visibleAlert) return
      setSubmitted(false)
      setManualOpen(true)
    }

    window.addEventListener(OPEN_MEMBERSHIP_RENEWAL_EVENT, handleManualOpen)
    return () => window.removeEventListener(OPEN_MEMBERSHIP_RENEWAL_EVENT, handleManualOpen)
  }, [visibleAlert])

  useEffect(() => {
    if (!selectedPlanId && options[0]) {
      setSelectedPlanId(options[0].plan_id)
    }
  }, [options, selectedPlanId])

  function handleClose() {
    if (dismissalKey && typeof window !== 'undefined') {
      setDismissedRenewalPrompt(() => window.localStorage, dismissalKey)
    }
    setManualOpen(false)
    setDismissed(true)
  }

  async function handleSubmit() {
    if (!activeStudentId || !selectedPlan) return

    try {
      await requestMutation.mutateAsync({
        studentId: activeStudentId,
        planId: selectedPlan.plan_id,
      })
      setSubmitted(true)
      toast.push({ message: 'Solicitud enviada a administracion.', type: 'success' })
    } catch (error: any) {
      toast.push({ message: error?.message || 'No se pudo enviar la solicitud.', type: 'error' })
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={submitted ? 'Solicitud enviada' : (promptCopy?.title || 'Renueva tu membresía')}
    >
      {submitted ? (
        <div className="space-y-4">
          <p className="text-sm text-textsec">
            Registramos tu solicitud. Realiza el pago y envianos el voucher para completar el proceso.
          </p>
          <div className="rounded-xl border border-line bg-bg/40 p-4">
            <p className="font-semibold text-textpri">Opciones de pago</p>
            <ul className="mt-3 space-y-2 text-sm text-textsec">
              {PAYMENT_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <Button onClick={handleClose} className="w-full">Entendido</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-textsec">
            {promptCopy?.message}
          </p>

          {optionsQuery.isLoading && (
            <div className="rounded-xl border border-line bg-bg/40 p-4 text-sm text-textsec">
              Cargando planes de renovacion...
            </div>
          )}

          {(optionsQuery.error || optionsMalformed) && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              No se pudieron cargar los planes de renovacion.
            </div>
          )}

          {!optionsQuery.isLoading && !optionsQuery.error && !optionsMalformed && options.length === 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              Ya existe una solicitud de renovacion pendiente o no hay planes activos disponibles.
            </div>
          )}

          {options.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {options.map((option) => (
                <PlanOption
                  key={option.plan_id}
                  option={option}
                  selected={selectedPlan?.plan_id === option.plan_id}
                  onSelect={() => setSelectedPlanId(option.plan_id)}
                />
              ))}
            </div>
          )}

          {selectedPlan && (
            <div className="rounded-xl border border-line bg-bg/40 p-4 text-sm text-textsec">
              <p>
                Total a pagar: <span className="font-semibold text-textpri">{formatSoles(selectedPlan.effective_price)}</span>
              </p>
              <p className="mt-2">
                Al confirmar, administracion recibira una notificacion para hacer seguimiento y validar tu pago.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-line bg-bg/40 p-4">
            <p className="font-semibold text-textpri">Opciones de pago</p>
            <ul className="mt-3 space-y-2 text-sm text-textsec">
              {PAYMENT_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-textsec">
              Una vez realizado el pago, envianos el voucher para completar el proceso.
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!selectedPlan || requestMutation.isPending || optionsQuery.isLoading || !!optionsQuery.error || optionsMalformed}
            className="w-full"
          >
            {requestMutation.isPending ? 'Enviando...' : 'Solicitar renovacion'}
          </Button>
        </div>
      )}
    </Modal>
  )
}
