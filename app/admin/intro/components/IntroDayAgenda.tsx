'use client'

import { calendarDate, calendarDayLabel, type IntroAppointment, type IntroCalendarSession } from '@/lib/utils/introCalendar'
import type { AppointmentCardActions } from './IntroAppointmentCard'
import IntroSessionSlot from './IntroSessionSlot'

export default function IntroDayAgenda({ sessions, rows, date, onCreate, active, ...actions }: AppointmentCardActions & {
  sessions: IntroCalendarSession[]; rows: IntroAppointment[]; date: string;
  onCreate: (session: IntroCalendarSession) => void; active: IntroAppointment | null;
}) {
  const daySessions = sessions.filter((session) => calendarDate(session.start_at) === date)
  const locations = Array.from(new Set(daySessions.map((session) => session.location_id)))
  return <section aria-label="Agenda diaria de clases de prueba" className="min-w-0 space-y-4">
    <h2 className="text-sm font-semibold text-slate-800">{calendarDayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    {!daySessions.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No hay horarios en esta fecha. Elige otro día o sede.</p>}
    {locations.map((locationId) => <div key={locationId} className="min-w-0 space-y-3">
      <h3 className="text-sm font-bold text-slate-900">{daySessions.find((session) => session.location_id === locationId)?.location_name}</h3>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{daySessions.filter((session) => session.location_id === locationId).sort((a, b) => a.start_at.localeCompare(b.start_at)).map((session) =>
        <IntroSessionSlot key={session.session_id} session={session} rows={rows.filter((row) => row.session_id === session.session_id)} onCreate={onCreate} active={active} {...actions} />)}</div>
    </div>)}
  </section>
}
