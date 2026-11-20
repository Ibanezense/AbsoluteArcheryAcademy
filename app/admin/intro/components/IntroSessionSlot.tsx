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
  const availability = !session.accepts_intro ? 'No admite nuevas pruebas'
    : new Date(session.start_at) <= new Date() ? 'Turno pasado'
      : session.available > 0 ? `${session.available} ${session.available === 1 ? 'cupo para prueba' : 'cupos para pruebas'}`
        : session.physical_remaining === 0 ? 'Sin plazas disponibles'
          : session.academy_remaining === 0 ? 'Sin arcos de academia' : 'Sin equipo disponible para pruebas'
  return (
    <section ref={setNodeRef} data-session-id={session.session_id} className={`min-w-0 rounded-xl border p-2 transition-colors ${isOver && validTarget ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200' : 'border-blue-100 bg-[#f4f9ff]'}`}>
      <IntroLocationHeader name={session.location_name} code={session.location_code} className="-mx-2 -mt-2 mb-2 rounded-t-xl" />
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <div className="min-w-0">
          <p className="text-xs font-bold tabular-nums text-[#101e3e]">{calendarTime(session.start_at)}–{calendarTime(session.end_at)}</p>
          {session.physical_remaining != null && <p className="mt-1 text-[11px] text-slate-600">{4 - session.physical_remaining}/4 plazas ocupadas</p>}
          {session.academy_remaining != null && <p className="mt-1 text-[11px] text-slate-600">{6 - session.academy_remaining}/6 cupos de arco ocupados</p>}
          {session.physical_remaining === undefined && session.academy_remaining === undefined && <p className="mt-1 text-[11px] text-slate-600">{session.booked_total}/{session.capacity} ocupados</p>}
        </div>
        <button type="button" aria-label={`Nueva cita a las ${calendarTime(session.start_at)} en ${session.location_name}`} disabled={!session.can_book || actions.disabled}
          onClick={() => onCreate(session)} className="grid size-11 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-[#0758aa] hover:bg-blue-100 disabled:text-slate-400"><Plus size={15} aria-hidden="true" /></button>
      </div>
      <div className="space-y-2">{rows.map((row) => <IntroAppointmentCard key={row.booking_id} row={row} {...actions} />)}</div>
      {!rows.length && <p className="px-1 py-4 text-center text-[11px] text-slate-600">{session.clients.length ? 'Sin citas que coincidan' : 'Sin citas'}</p>}
      <p className={`mt-2 px-1 text-[11px] font-semibold ${session.can_book ? 'text-[#084681]' : 'text-slate-600'}`}>{availability}</p>
    </section>
  )
}
