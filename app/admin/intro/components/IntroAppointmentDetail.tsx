'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ATTENDANCE_STATES, attendanceStatus, calendarDate, calendarDayLabel, calendarTime, canReschedule, type IntroAppointment, type IntroState } from '@/lib/utils/introCalendar'
import { getIntroEnrollment } from '@/lib/services/introEnrollmentService'
import IntroDialog from './IntroDialog'

export default function IntroAppointmentDetail({ row, onClose, onEdit, onState, onCollect, onReactivate, busy }: {
  row: IntroAppointment; onClose: () => void; onEdit: () => void; onState: (state: IntroState) => void;
  onCollect: () => void; onReactivate: () => void; busy: boolean;
}) {
  const [showPhone, setShowPhone] = useState(false)
  const digits = row.phone?.replace(/\D/g, '') || ''
  const international = digits.length === 9 ? `51${digits}` : digits
  const whatsapp = international.length >= 10 ? `https://wa.me/${international}?text=${encodeURIComponent(`Hola, ${row.full_name}. Te escribimos de Absolute Archery por tu clase de prueba.`)}` : null
  const status = attendanceStatus(row)
  const attendance = ATTENDANCE_STATES.find(state => state.value === status)!
  const started = Date.parse(row.session_start) <= Date.now()
  const enrollment = useQuery({
    queryKey: ['intro-enrollment', row.intro_client_id],
    queryFn: async () => ({ studentId: await getIntroEnrollment(row.intro_client_id) }),
    enabled: status === 'attended',
  })
  return <IntroDialog title={row.full_name} onClose={onClose} busy={busy}>
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-slate-900">{row.location_name}</p><p className="mt-1 text-sm text-slate-600">{calendarDayLabel(calendarDate(row.session_start), { weekday: 'long', day: 'numeric', month: 'long' })} · {calendarTime(row.session_start)}–{calendarTime(row.session_end)}</p><p className="mt-2 text-sm text-slate-500">{row.age} años</p><p className="mt-2 text-sm text-slate-600">{showPhone ? row.phone : digits ? `${digits.slice(0, 3)} ••• ${digits.slice(-3)}` : 'Sin teléfono'} {digits && <button type="button" onClick={() => setShowPhone(!showPhone)} className="ml-2 text-xs underline">{showPhone ? 'Ocultar' : 'Mostrar'}</button>}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">Asistencia</h3>
          <p className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${attendance.color}`}>{attendance.label}</p>
          {started && status !== 'cancelled' && <div className="flex flex-wrap gap-2">
            {status !== 'attended' && <button type="button" disabled={busy} onClick={() => onState('attended')} className="btn-outline min-h-11 px-3 text-xs">Marcar asistencia</button>}
            {status !== 'no_show' && <button type="button" disabled={busy} onClick={() => onState('no_show')} className="btn-outline min-h-11 px-3 text-xs">Marcar que no asistió</button>}
          </div>}
          {!started && status === 'reserved' && <p className="text-xs text-slate-600">Podrás marcar la asistencia al empezar el turno.</p>}
        </section>
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">Pago</h3>
          <p className="text-sm font-semibold text-slate-800">{row.payment_status === 'paid' ? 'Pagado' : row.payment_status === 'pending' ? row.pay_on_site ? 'Paga en sede' : 'Por pagar' : row.intro_class_type === 'courtesy' ? 'Cortesía' : 'Gratuita'}{row.payment_status !== 'not_applicable' && ` · S/ ${Number(row.amount_paid || 0).toFixed(2)}`}</p>
          {row.payment_status === 'paid' && <p className="text-xs capitalize text-slate-600">{row.payment_method}</p>}
          {row.courtesy_reason && <p className="text-xs text-slate-600">{row.courtesy_reason}</p>}
          {status !== 'cancelled' && row.payment_status === 'pending' && <button type="button" disabled={busy} onClick={onCollect} className="btn-outline min-h-11 px-3 text-xs">Registrar cobro</button>}
        </section>
      </div>
      {status === 'attended' && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 p-4">
        <h3 className="text-sm font-bold text-blue-950">Inscripción</h3>
        {enrollment.isLoading ? <p className="text-xs text-blue-900">Consultando ficha…</p>
          : enrollment.isError ? <button type="button" onClick={() => void enrollment.refetch()} className="min-h-11 text-xs text-blue-900 underline">Reintentar consulta</button>
          : enrollment.data?.studentId ? <Link className="btn-outline min-h-11" href={`/admin/alumnos/${enrollment.data.studentId}`}>Ver ficha del alumno</Link>
          : enrollment.data?.studentId === null ? <p className="text-xs text-slate-700">La ficha vinculada ya no está disponible.</p>
          : <Link className="btn min-h-11" href={`/admin/alumnos/editar/new?prueba=${encodeURIComponent(row.booking_id)}`}>Inscribir alumno</Link>}
      </section>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onEdit} className="btn-outline min-h-11">{canReschedule(row) ? 'Editar o reprogramar' : 'Editar datos y pago'}</button>
        {status === 'reserved' && <button type="button" disabled={busy} onClick={() => onState('cancelled')} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50">Cancelar cita</button>}
        {status !== 'reserved' && <button type="button" disabled={busy} onClick={onReactivate} className="btn-outline min-h-11">Reactivar cita</button>}
        {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Abrir WhatsApp</a>}
      </div>
    </div>
  </IntroDialog>
}
