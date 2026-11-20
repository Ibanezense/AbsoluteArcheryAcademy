'use client'

import { ATTENDANCE_STATES, attendanceStatus, type IntroAppointment } from '@/lib/utils/introCalendar'
import IntroAppointmentCard, { type AppointmentCardActions } from './IntroAppointmentCard'

function StateColumn({ state, rows, ...actions }: AppointmentCardActions & { state: typeof ATTENDANCE_STATES[number]; rows: IntroAppointment[] }) {
  return <section className="min-w-0 rounded-2xl border border-[#d7e4f3] bg-[#f6faff] p-3">
    <div className="mb-4 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${state.dot}`} /><h2 className="text-sm font-bold text-slate-800">{state.label}</h2><span className="ml-auto rounded-md bg-white px-2 py-0.5 text-xs text-slate-500">{rows.length}</span></div>
    <div className="space-y-3">{rows.map((row) => <IntroAppointmentCard key={row.booking_id} row={row} draggable={false} {...actions} />)}</div>
    {!rows.length && <p className="py-12 text-center text-xs text-slate-400">Sin citas</p>}
  </section>
}

export default function IntroStatusBoard({ rows, ...actions }: AppointmentCardActions & { rows: IntroAppointment[] }) {
  return <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">{ATTENDANCE_STATES.map((state) => <StateColumn key={state.value} state={state} rows={rows.filter((row) => attendanceStatus(row) === state.value)} {...actions} />)}</div>
}
