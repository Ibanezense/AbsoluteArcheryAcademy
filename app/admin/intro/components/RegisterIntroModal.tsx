'use client'

import { useEffect, useState } from 'react'
import { X, Calendar, DollarSign, User, Phone, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import {
  IntroClassesService,
  type AvailableIntroSession,
  type IntroClassType,
  type IntroPaymentStatus,
} from '@/lib/services/IntroClassesService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const paidDefaults = {
  introClassType: 'paid' as IntroClassType,
  paymentStatus: 'paid' as IntroPaymentStatus,
  amountPaid: '45.00',
  paymentMethod: 'transferencia',
  courtesyReason: '',
}

export default function RegisterIntroModal({ isOpen, onClose, onSuccess }: Props) {
  const [sessions, setSessions] = useState<AvailableIntroSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    fullName: '',
    age: '',
    phone: '',
    sessionId: '',
    ...paidDefaults,
  })

  useEffect(() => {
    if (isOpen) {
      void loadSessions()
      setFormData({
        fullName: '',
        age: '',
        phone: '',
        sessionId: '',
        ...paidDefaults,
      })
      setError(null)
    }
  }, [isOpen])

  const loadSessions = async () => {
    setIsLoading(true)
    try {
      const available = await IntroClassesService.getAvailableSessions(7)
      setSessions(available)
      if (available.length > 0) {
        setFormData((prev) => ({ ...prev, sessionId: available[0].session_id }))
      }
    } catch (err) {
      setError('Error al cargar turnos disponibles.')
    } finally {
      setIsLoading(false)
    }
  }

  const updateIntroClassType = (introClassType: IntroClassType) => {
    setFormData((prev) => ({
      ...prev,
      introClassType,
      amountPaid: introClassType === 'paid' ? (Number(prev.amountPaid) > 0 ? prev.amountPaid : '45.00') : '0.00',
      paymentStatus: introClassType === 'paid' ? 'paid' : 'not_applicable',
      paymentMethod: introClassType === 'paid' ? (prev.paymentMethod === 'not_applicable' ? 'transferencia' : prev.paymentMethod) : 'not_applicable',
      courtesyReason: introClassType === 'courtesy' ? prev.courtesyReason : '',
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.fullName || !formData.age || !formData.sessionId || formData.amountPaid === '') {
      setError('Por favor completa todos los campos requeridos.')
      return
    }

    if (formData.introClassType === 'paid' && Number(formData.amountPaid) <= 0) {
      setError('Una clase pagada requiere un monto mayor a cero.')
      return
    }

    if (formData.introClassType !== 'paid' && Number(formData.amountPaid) !== 0) {
      setError('Las clases gratuitas o de cortesia deben tener monto cero.')
      return
    }

    if (formData.introClassType === 'courtesy' && !formData.courtesyReason.trim()) {
      setError('Indica el motivo de la cortesia.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await IntroClassesService.registerIntroClass({
        fullName: formData.fullName,
        age: parseInt(formData.age, 10),
        phone: formData.phone,
        sessionId: formData.sessionId,
        amountPaid: parseFloat(formData.amountPaid),
        paymentMethod: formData.paymentMethod,
        introClassType: formData.introClassType,
        paymentStatus: formData.paymentStatus,
        courtesyReason: formData.courtesyReason,
      })

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Error al procesar el registro.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 p-4">
        <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-[1.6rem] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)] ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <h2 className="text-lg font-black text-textpri">Nueva clase intro</h2>
              <p className="mt-1 text-xs text-textsec">Pagada, gratuita o cortesia con reglas persistentes.</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-textsec transition-colors hover:bg-black/5 hover:text-textpri"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4">
            {error && (
              <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-600">
                {error}
              </div>
            )}

            <form id="intro-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-textsec">1. Datos del cliente</h3>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-textpri">Nombre completo *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={18} />
                    <input
                      type="text"
                      className="w-full rounded-xl border border-line bg-background py-2.5 pl-10 pr-4 text-sm text-textpri outline-none transition-colors focus:border-accent"
                      placeholder="Ej: Laura Torres"
                      value={formData.fullName}
                      onChange={(event) => setFormData((prev) => ({ ...prev, fullName: event.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-textpri">Edad *</label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-line bg-background px-4 py-2.5 text-sm text-textpri outline-none transition-colors focus:border-accent"
                      placeholder="Ej: 25"
                      min="5"
                      value={formData.age}
                      onChange={(event) => setFormData((prev) => ({ ...prev, age: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-textpri">Telefono</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={16} />
                      <input
                        type="tel"
                        className="w-full rounded-xl border border-line bg-background py-2.5 pl-9 pr-4 text-sm text-textpri outline-none transition-colors focus:border-accent"
                        placeholder="Ej: 999 888 777"
                        value={formData.phone}
                        onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px w-full bg-line" />

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-textsec">2. Asignar turno</h3>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-textpri">
                    Proximas sesiones con cupo
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={18} />
                    <select
                      className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-background py-2.5 pl-10 pr-10 text-sm text-textpri outline-none transition-colors focus:border-accent disabled:opacity-50"
                      value={formData.sessionId}
                      onChange={(event) => setFormData((prev) => ({ ...prev, sessionId: event.target.value }))}
                      disabled={isLoading || sessions.length === 0}
                      required
                    >
                      {isLoading ? (
                        <option value="">Cargando turnos...</option>
                      ) : sessions.length === 0 ? (
                        <option value="">No hay turnos con cupo los proximos 7 dias</option>
                      ) : (
                        sessions.map((session) => (
                          <option key={session.session_id} value={session.session_id}>
                            {dayjs(session.start_at).format('ddd DD MMM - HH:mm')} ({session.available} cupos libres)
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <p className="mt-1.5 text-xs text-textsec">
                    Las clases intro ocupan cupo real de 10 m.
                  </p>
                </div>
              </div>

              <div className="h-px w-full bg-line" />

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-textsec">3. Tipo y pago</h3>

                <div>
                  <label className="mb-2 block text-sm font-medium text-textpri">Tipo de clase intro *</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ['paid', 'Pagada', 'Tarifa regular'],
                      ['free', 'Gratuita', 'Promocion'],
                      ['courtesy', 'Cortesia', 'Excepcion'],
                    ].map(([value, label, helper]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateIntroClassType(value as IntroClassType)}
                        className={clsx(
                          'min-h-16 rounded-xl border px-3 py-2 text-left transition',
                          formData.introClassType === value
                            ? 'border-accent bg-accent/10 text-textpri shadow-soft'
                            : 'border-line bg-background text-textsec hover:border-accent/40',
                        )}
                      >
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="mt-0.5 block text-xs">{helper}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-textpri">Monto *</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec" size={16} />
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-line bg-background py-2.5 pl-9 pr-4 text-sm text-textpri outline-none transition-colors focus:border-accent disabled:opacity-70"
                        value={formData.amountPaid}
                        onChange={(event) => setFormData((prev) => ({ ...prev, amountPaid: event.target.value }))}
                        disabled={formData.introClassType !== 'paid'}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-textpri">Estado</label>
                    <select
                      className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-background px-4 py-2.5 text-sm text-textpri outline-none transition-colors focus:border-accent disabled:opacity-70"
                      value={formData.paymentStatus}
                      onChange={(event) => setFormData((prev) => ({ ...prev, paymentStatus: event.target.value as IntroPaymentStatus }))}
                      disabled={formData.introClassType !== 'paid'}
                    >
                      {formData.introClassType === 'paid' ? (
                        <>
                          <option value="paid">Pagado</option>
                          <option value="pending">Pendiente</option>
                        </>
                      ) : (
                        <option value="not_applicable">No aplica</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-textpri">Metodo</label>
                    <select
                      className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-background px-4 py-2.5 text-sm text-textpri outline-none transition-colors focus:border-accent disabled:opacity-70"
                      value={formData.paymentMethod}
                      onChange={(event) => setFormData((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                      disabled={formData.introClassType !== 'paid'}
                    >
                      {formData.introClassType === 'paid' ? (
                        <>
                          <option value="transferencia">Transferencia</option>
                          <option value="yape">Yape</option>
                          <option value="plin">Plin</option>
                          <option value="efectivo">Efectivo</option>
                        </>
                      ) : (
                        <option value="not_applicable">No aplica</option>
                      )}
                    </select>
                  </div>
                </div>

                {formData.introClassType === 'courtesy' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-textpri">Motivo de cortesia *</label>
                    <textarea
                      className="min-h-24 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm text-textpri outline-none transition-colors focus:border-accent"
                      placeholder="Ej: invitacion autorizada por direccion comercial"
                      value={formData.courtesyReason}
                      onChange={(event) => setFormData((prev) => ({ ...prev, courtesyReason: event.target.value }))}
                      required
                    />
                  </div>
                )}
              </div>
            </form>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line bg-background/50 px-6 py-4">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-textpri transition-colors hover:bg-black/5 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="intro-form"
              disabled={isSubmitting || sessions.length === 0}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-transform hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Registrando...
                </>
              ) : (
                'Confirmar y agendar'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
