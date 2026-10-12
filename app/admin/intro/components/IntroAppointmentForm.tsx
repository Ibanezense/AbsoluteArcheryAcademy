'use client'

import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useAcademyLocations } from '@/lib/infrastructureQueries'
import { IntroClassesService, type IntroAppointmentDetails, type IntroClassType, type IntroPaymentStatus } from '@/lib/services/IntroClassesService'
import { calendarDate, calendarDayLabel, calendarTime, weekDates, type IntroAppointment, type IntroCalendarSession, type IntroState } from '@/lib/utils/introCalendar'
import IntroDialog from './IntroDialog'

export default function IntroAppointmentForm({ client, initialSession, requestedState, onClose, onSave }: {
  client?: IntroAppointment; initialSession?: IntroCalendarSession; requestedState?: IntroState;
  onClose: () => void; onSave: (details: IntroAppointmentDetails, sessionId: string, requestId: string) => Promise<void>;
}) {
  const { data: locations = [] } = useAcademyLocations()
  const [requestId] = useState(() => crypto.randomUUID())
  const [locationId, setLocationId] = useState(client?.location_id || initialSession?.location_id || '')
  const [date, setDate] = useState(calendarDate(client?.session_start || initialSession?.start_at || new Date()))
  const [sessionId, setSessionId] = useState(client?.session_id || initialSession?.session_id || '')
  const [details, setDetails] = useState<IntroAppointmentDetails>(() => {
    const type = requestedState === 'reserved' ? 'free' : requestedState === 'paid' || requestedState === 'pending' ? 'paid' : client?.intro_class_type || 'paid'
    const payment = type !== 'paid' ? 'not_applicable' : requestedState === 'paid' ? 'paid' : requestedState === 'pending' ? 'pending' : client?.payment_status || 'pending'
    return { fullName: client?.full_name || '', age: client?.age || 0, phone: client?.phone || '',
      amountPaid: type === 'paid' ? Number(client?.amount_paid) || 45 : 0,
      paymentMethod: payment === 'paid' ? client?.payment_method !== 'not_applicable' && client?.payment_method || 'transferencia' : 'not_applicable',
      introClassType: type, paymentStatus: payment, courtesyReason: client?.courtesy_reason || '',
      payOnSite: payment === 'pending' && Boolean(client?.pay_on_site),
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dates = weekDates(date)
  const schedule = useQuery({
    queryKey: ['intro-available-sessions', 'form', dates[0], dates[6], locationId],
    queryFn: () => IntroClassesService.getCalendar(dates[0], dates[6], locationId), enabled: Boolean(locationId), staleTime: 0,
  })
  const slots = (schedule.data || []).filter((session) => calendarDate(session.start_at) === date && (session.can_book || session.session_id === client?.session_id))
  const currentAssignment = client && client.location_id === locationId && calendarDate(client.session_start) === date
    ? { session_id: client.session_id, start_at: client.session_start, end_at: client.session_end, available: 0, can_book: false } : null
  const options = currentAssignment && !slots.some((slot) => slot.session_id === currentAssignment.session_id) ? [currentAssignment, ...slots] : slots
  const patch = (value: Partial<IntroAppointmentDetails>) => setDetails((previous) => ({ ...previous, ...value }))
  const setType = (type: IntroClassType) => patch({ introClassType: type, amountPaid: type === 'paid' ? details.amountPaid || 45 : 0,
    paymentStatus: type === 'paid' ? 'pending' : 'not_applicable', paymentMethod: 'not_applicable', payOnSite: false,
    courtesyReason: type === 'courtesy' ? details.courtesyReason : '' })
  const setPayment = (payment: IntroPaymentStatus) => patch({ paymentStatus: payment,
    paymentMethod: payment === 'paid' ? 'transferencia' : 'not_applicable', payOnSite: payment === 'pending' && details.payOnSite })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!sessionId || !options.some((slot) => slot.session_id === sessionId)) { setError('Selecciona un turno disponible.'); return }
    if (details.introClassType === 'courtesy' && !details.courtesyReason?.trim()) { setError('Indica el motivo de cortesía.'); return }
    setBusy(true); setError('')
    try { await onSave(details, sessionId, requestId) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la cita.'); void schedule.refetch() }
    finally { setBusy(false) }
  }
  const input = 'mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-accent focus:outline-none disabled:opacity-60'
  const reactivating = Boolean(requestedState && ['reserved', 'pending', 'paid'].includes(requestedState) && client?.booking_status !== 'reserved')
  const blockedMove = Boolean(client && client.booking_status !== 'reserved' && !reactivating)
  return <IntroDialog title={client ? 'Editar cita de prueba' : 'Nueva cita de prueba'} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <fieldset disabled={busy} className="space-y-5">
        <section className="space-y-3"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Datos del cliente</h3>
          <label className="block text-sm font-medium text-slate-700">Nombre completo<input required autoComplete="name" value={details.fullName} onChange={(event) => patch({ fullName: event.target.value })} className={input} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Edad<input required type="number" min="5" max="99" value={details.age || ''} onChange={(event) => patch({ age: Number(event.target.value) })} className={input} /></label><label className="text-sm font-medium text-slate-700">Teléfono<input type="tel" value={details.phone || ''} onChange={(event) => patch({ phone: event.target.value })} className={input} /></label></div>
        </section>
        <section className="space-y-3 border-t border-slate-100 pt-4"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sede y horario</h3>
          {blockedMove && <p className="text-xs text-slate-500">Para reprogramar una cita finalizada o cancelada, reactívala desde su estado.</p>}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Sede<select required disabled={blockedMove} value={locationId} onChange={(event) => { setLocationId(event.target.value); setSessionId('') }} className={input}><option value="">Selecciona una sede</option>{locations.filter((location) => location.is_active || location.id === client?.location_id).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Fecha<input required disabled={blockedMove} type="date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setSessionId('') } }} className={input} /></label></div>
          <label className="block text-sm font-medium text-slate-700">Turno<select required disabled={!locationId || schedule.isLoading || blockedMove} value={sessionId} onChange={(event) => setSessionId(event.target.value)} className={input}><option value="">Selecciona un horario</option>{options.map((session) => <option key={session.session_id} value={session.session_id}>{session.session_id === client?.session_id ? 'Turno actual · ' : ''}{calendarTime(session.start_at)}–{calendarTime(session.end_at)}{session.can_book ? ` · ${session.available} cupos libres` : ''}</option>)}</select></label>
          {schedule.isLoading && locationId && <p className="text-xs text-slate-500">Cargando horarios…</p>}
          {schedule.isError && <p role="alert" className="text-xs text-rose-700">No pudimos consultar los horarios. <button type="button" onClick={() => void schedule.refetch()} className="underline">Reintentar</button></p>}
          {locationId && !schedule.isLoading && !schedule.isError && !options.length && <p className="text-xs text-amber-700">No hay turnos con cupo en esta sede para {calendarDayLabel(date)}.</p>}
          {client && locationId !== client.location_id && <label className="flex gap-2 rounded-xl bg-orange-50 p-3 text-xs text-orange-900"><input required type="checkbox" />Confirmo el traslado de {client.location_name} a {locations.find((location) => location.id === locationId)?.name || 'la sede seleccionada'}.</label>}
          {reactivating && <label className="flex gap-2 rounded-xl bg-orange-50 p-3 text-xs text-orange-900"><input required type="checkbox" />Confirmo la reactivación de esta cita en un turno futuro con cupo.</label>}
        </section>
        <section className="space-y-3 border-t border-slate-100 pt-4"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tipo y pago</h3>
          <div className="grid grid-cols-3 gap-2">{([['paid', 'Con cobro'], ['free', 'Gratuita'], ['courtesy', 'Cortesía']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={details.introClassType === value} onClick={() => setType(value)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${details.introClassType === value ? 'border-accent bg-orange-50 text-accent' : 'border-slate-200 text-slate-600'}`}>{label}</button>)}</div>
          {details.introClassType === 'paid' && <>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">{details.paymentStatus === 'paid' ? 'Monto recibido (S/)' : 'Monto por pagar (S/)'}<input required type="number" min="0.01" step="0.01" value={details.amountPaid} onChange={(event) => patch({ amountPaid: Number(event.target.value) })} className={input} /></label><label className="text-sm font-medium text-slate-700">Estado de pago<select value={details.paymentStatus} onChange={(event) => setPayment(event.target.value as IntroPaymentStatus)} className={input}><option value="pending">Por pagar</option><option value="paid">Pagado</option></select></label></div>
            {details.paymentStatus === 'pending' ? <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><input type="checkbox" checked={details.payOnSite} onChange={(event) => patch({ payOnSite: event.target.checked })} className="mt-1 accent-orange-600" /><span className="text-sm font-semibold text-amber-900">Pagará en sede<span className="mt-1 block text-xs font-normal text-amber-800">El cupo queda reservado. El ingreso se registra al confirmar el pago.</span></span></label>
              : <label className="block text-sm font-medium text-slate-700">Método del pago recibido<select required value={details.paymentMethod} onChange={(event) => patch({ paymentMethod: event.target.value })} className={input}><option value="transferencia">Transferencia</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option></select></label>}
          </>}
          {details.introClassType === 'courtesy' && <label className="block text-sm font-medium text-slate-700">Motivo de cortesía<textarea required value={details.courtesyReason || ''} onChange={(event) => patch({ courtesyReason: event.target.value })} className={`${input} min-h-20 py-3`} /></label>}
          {client?.payment_status === 'paid' && (details.paymentStatus !== 'paid' || details.amountPaid !== Number(client.amount_paid)) && <label className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800"><input required type="checkbox" />Confirmo la corrección del pago previamente registrado.</label>}
        </section>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Cerrar</button><button type="submit" disabled={busy || schedule.isLoading || !sessionId} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Guardando…' : 'Guardar cita'}</button></div>
    </form>
  </IntroDialog>
}
