'use client'

import { MapPin } from 'lucide-react'
import { calendarDate, calendarDayLabel, type IntroAppointment, type IntroCalendarSession } from '@/lib/utils/introCalendar'
import IntroSessionSlot from './IntroSessionSlot'
import type { AppointmentCardActions } from './IntroAppointmentCard'

export default function IntroWeekCalendar({ sessions, rows, dates, selectedDay, onDayChange, onCreate, active, ...actions }: AppointmentCardActions & {
  sessions: IntroCalendarSession[]; rows: IntroAppointment[]; dates: string[]; selectedDay: string;
  onDayChange: (date: string) => void; onCreate: (session: IntroCalendarSession) => void; active: IntroAppointment | null;
}) {
  const locations = Array.from(new Map(sessions.map((session) => [session.location_id, { id: session.location_id, name: session.location_name }])).values())
  const today = calendarDate(new Date())
  const mobileDate = dates.includes(selectedDay) ? selectedDay : dates[0]
  const renderSlots = (locationId: string, date: string) => {
    const daySessions = sessions.filter((session) => session.location_id === locationId && calendarDate(session.start_at) === date)
    return daySessions.length ? daySessions.map((session) => <IntroSessionSlot key={session.session_id} session={session} rows={rows.filter((row) => row.session_id === session.session_id)} onCreate={onCreate} active={active} {...actions} />)
      : <p className="py-12 text-center text-xs text-slate-400">Sin horarios</p>
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-7 gap-1 lg:hidden">{dates.map((date) => <button type="button" key={date} onClick={() => onDayChange(date)} aria-pressed={mobileDate === date} className={`rounded-xl py-2 text-center ${mobileDate === date ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}><span className="block text-[10px] uppercase">{calendarDayLabel(date, { weekday: 'short' })}</span><span className="block text-lg font-bold">{date.slice(-2)}</span></button>)}</div>
      {locations.map((location) => (
        <section key={location.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3"><MapPin size={15} className="text-accent" /><h2 className="text-sm font-bold text-slate-800">{location.name}</h2><span className="ml-auto text-xs text-slate-400">{rows.filter((row) => row.location_id === location.id).length} citas</span></div>
          <div className="overflow-x-auto">
            <div className="lg:grid lg:min-w-[1120px] lg:grid-cols-7 lg:divide-x lg:divide-slate-100">
              {dates.map((date) => <div key={date} className={`min-h-[420px] ${date === mobileDate ? 'block' : 'hidden lg:block'} ${date === today ? 'bg-orange-50/30' : ''}`}>
                <div className={`sticky top-0 z-10 border-b border-slate-100 py-3 text-center ${date === today ? 'bg-orange-50 text-accent' : 'bg-slate-50/95 text-slate-600'}`}><p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{calendarDayLabel(date, { weekday: 'short' })}</p><p className="mt-1 text-xl font-bold">{Number(date.slice(-2))}</p></div>
                <div className="space-y-3 p-2">{renderSlots(location.id, date)}</div>
              </div>)}
            </div>
          </div>
        </section>
      ))}
      {!locations.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="font-bold text-slate-800">Sin horarios esta semana</h2><p className="mt-2 text-sm text-slate-500">Selecciona otra semana o sede para consultar su agenda.</p></div>}
    </div>
  )
}
