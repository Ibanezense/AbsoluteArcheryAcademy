'use client'

import { useState } from 'react'
import { INTRO_STATES, appointmentStatus, calendarDate, calendarDayLabel, calendarTime, canReschedule, type IntroAppointment, type IntroState } from '@/lib/utils/introCalendar'
import IntroDialog from './IntroDialog'

export default function IntroAppointmentDetail({ row, onClose, onEdit, onState, busy }: {
  row: IntroAppointment; onClose: () => void; onEdit: () => void; onState: (state: IntroState) => void; busy: boolean;
}) {
  const [showPhone, setShowPhone] = useState(false)
  const digits = row.phone?.replace(/\D/g, '') || ''
  const whatsapp = digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hola, ${row.full_name}. Te escribimos de Absolute Archery por tu clase de prueba.`)}` : null
  return <IntroDialog title={row.full_name} onClose={onClose} busy={busy}>
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-900">{row.location_name}</p><p className="mt-1 text-sm text-slate-600">{calendarDayLabel(calendarDate(row.session_start), { weekday: 'long', day: 'numeric', month: 'long' })} · {calendarTime(row.session_start)}–{calendarTime(row.session_end)}</p><p className="mt-2 text-sm text-slate-500">{row.age} años</p><p className="mt-2 text-sm text-slate-600">{showPhone ? row.phone : digits ? `${digits.slice(0, 3)} ••• ${digits.slice(-3)}` : 'Sin teléfono'} {digits && <button type="button" onClick={() => setShowPhone(!showPhone)} className="ml-2 text-xs underline">{showPhone ? 'Ocultar' : 'Mostrar'}</button>}</p></div>
      <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado de la cita</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{INTRO_STATES.map((state) => <button type="button" key={state.value} disabled={busy || appointmentStatus(row) === state.value} onClick={() => onState(state.value)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${appointmentStatus(row) === state.value ? state.color : 'border-slate-200 text-slate-600'} disabled:cursor-default`}>{state.label}</button>)}</div></div>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-400">Pago</dt><dd className="mt-1 font-semibold text-slate-800">{row.payment_status === 'paid' ? 'Pagado' : row.payment_status === 'pending' ? `Por pagar${row.pay_on_site ? ' · Paga en sede' : ''}` : 'No aplica'}</dd></div><div><dt className="text-slate-400">Importe</dt><dd className="mt-1 font-semibold text-slate-800">S/ {Number(row.amount_paid || 0).toFixed(2)}</dd></div>{row.payment_status === 'paid' && <div><dt className="text-slate-400">Método</dt><dd className="mt-1 text-slate-800">{row.payment_method}</dd></div>}{row.courtesy_reason && <div><dt className="text-slate-400">Motivo de cortesía</dt><dd className="mt-1 text-slate-800">{row.courtesy_reason}</dd></div>}</dl>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={onEdit} className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white">{canReschedule(row) ? 'Editar / Reprogramar' : 'Editar datos y pago'}</button>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Abrir WhatsApp</a>}</div>
    </div>
  </IntroDialog>
}
