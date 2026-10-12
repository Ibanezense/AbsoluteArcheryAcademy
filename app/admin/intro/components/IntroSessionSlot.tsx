'use client'

import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { calendarTime, canReschedule, type IntroAppointment, type IntroCalendarSession } from '@/lib/utils/introCalendar'
import IntroAppointmentCard, { type AppointmentCardActions } from './IntroAppointmentCard'
import IntroLocationHeader from './IntroLocationHeader'

export default function IntroSessionSlot({ session, rows, onCreate, active, ...actions }: AppointmentCardActions & {
  session: IntroCalendarSession; rows: IntroAppointment[]; onCreate: (session: IntroCalendarSession) => void; active: IntroAppointment | null;
}) {
  const validTarget = session.can_book && (!active || canReschedule(active)) && active?.session_id !== session.session_id
  const { setNodeRef, isOver } = useDroppable({ id: `session:${session.session_id}`, data: { session }, disabled: !validTarget || actions.disabled })
  return (
    <section ref={setNodeRef} data-session-id={session.session_id} className={`rounded-xl border p-2 transition-colors ${isOver && validTarget ? 'border-accent bg-orange-50 ring-2 ring-accent/20' : 'border-slate-200/80 bg-slate-50/70'}`}>
      <IntroLocationHeader name={session.location_name} code={session.location_code} className="-mx-2 -mt-2 mb-2 rounded-t-xl" />
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <div><p className="text-xs font-bold text-slate-700">{calendarTime(session.start_at)}–{calendarTime(session.end_at)}</p><p className="mt-1 text-[10px] text-slate-500">{session.booked_total}/{session.capacity} ocupados</p></div>
        <button type="button" aria-label={`Nueva cita a las ${calendarTime(session.start_at)} en ${session.location_name}`} disabled={!session.can_book || actions.disabled} onClick={() => onCreate(session)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-accent hover:border-accent disabled:text-slate-300"><Plus size={14} /></button>
      </div>
      <div className="space-y-2">{rows.map((row) => <IntroAppointmentCard key={row.booking_id} row={row} {...actions} />)}</div>
      {!rows.length && <p className="px-1 py-4 text-center text-[11px] text-slate-400">{session.clients.length ? 'Sin citas que coincidan' : 'Sin citas'}</p>}
      <p className={`mt-2 px-1 text-[10px] font-medium ${session.can_book ? 'text-emerald-700' : 'text-slate-400'}`}>
        {!session.accepts_intro ? 'No admite nuevas pruebas' : new Date(session.start_at) <= new Date() ? 'Turno pasado' : session.available > 0 ? `${session.available} ${session.available === 1 ? 'cupo libre' : 'cupos libres'}` : 'Sin cupos'}
      </p>
    </section>
  )
}
