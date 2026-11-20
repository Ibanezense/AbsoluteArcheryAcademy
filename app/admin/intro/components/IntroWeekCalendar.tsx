'use client'

import { calendarDate, calendarDayLabel, type IntroAppointment, type IntroCalendarSession } from '@/lib/utils/introCalendar'
import IntroSessionSlot from './IntroSessionSlot'
import type { AppointmentCardActions } from './IntroAppointmentCard'

export default function IntroWeekCalendar({ sessions, rows, dates, selectedDay, onDayChange, onCreate, active, ...actions }: AppointmentCardActions & {
  sessions: IntroCalendarSession[]; rows: IntroAppointment[]; dates: string[]; selectedDay: string;
  onDayChange: (date: string) => void; onCreate: (session: IntroCalendarSession) => void; active: IntroAppointment | null;
}) {
  const today = calendarDate(new Date())
  const mobileDate = dates.includes(selectedDay) ? selectedDay : dates[0]
  const renderSlots = (date: string) => {
    const daySessions = sessions.filter((session) => calendarDate(session.start_at) === date)
      .sort((a, b) => a.start_at.localeCompare(b.start_at) || a.location_name.localeCompare(b.location_name, 'es'))
    return daySessions.length ? daySessions.map((session) => <IntroSessionSlot key={session.session_id} session={session} rows={rows.filter((row) => row.session_id === session.session_id)} onCreate={onCreate} active={active} {...actions} />)
      : <p className="py-12 text-center text-xs text-slate-600">Sin horarios</p>
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-7 gap-1 md:hidden">{dates.map((date) => <button type="button" key={date} onClick={() => onDayChange(date)} aria-pressed={mobileDate === date} className={`min-h-11 rounded-lg py-2 text-center ${mobileDate === date ? 'bg-[#0758aa] text-white' : 'border border-blue-100 bg-white text-[#084681]'}`}><span className="block text-[10px] uppercase">{calendarDayLabel(date, { weekday: 'short' })}</span><span className="block text-lg font-bold">{date.slice(-2)}</span></button>)}</div>
      {sessions.length > 0 && (
        <section aria-label="Calendario semanal de clases de prueba" className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
          <div className="overflow-auto md:max-h-[70dvh]">
            <div aria-label="Semana de lunes a domingo" className="md:grid md:min-w-[980px] md:grid-cols-7 md:divide-x md:divide-blue-100">
              {dates.map((date) => <div key={date} data-calendar-day={date} className={`min-h-[420px] ${date === mobileDate ? 'block' : 'hidden md:block'} ${date === today ? 'bg-orange-50/30' : ''}`}>
                <div className={`sticky top-0 z-10 border-b border-blue-100 py-3 text-center ${date === today ? 'bg-orange-50 text-orange-900' : 'bg-[#edf5ff] text-[#084681]'}`}><p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{calendarDayLabel(date, { weekday: 'short' })}</p><p className="mt-1 text-xl font-bold">{Number(date.slice(-2))}</p></div>
                <div className="space-y-3 p-2">{renderSlots(date)}</div>
              </div>)}
            </div>
          </div>
        </section>
      )}
      {!sessions.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="font-bold text-slate-800">Sin horarios esta semana</h2><p className="mt-2 text-sm text-slate-500">Selecciona otra semana o sede para consultar su agenda.</p></div>}
    </div>
  )
}
