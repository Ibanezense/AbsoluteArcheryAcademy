'use client'

import { useDroppable } from '@dnd-kit/core'
import { INTRO_STATES, appointmentStatus, type IntroAppointment } from '@/lib/utils/introCalendar'
import IntroAppointmentCard, { type AppointmentCardActions } from './IntroAppointmentCard'

function StateColumn({ state, rows, ...actions }: AppointmentCardActions & { state: typeof INTRO_STATES[number]; rows: IntroAppointment[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `state:${state.value}`, data: { state: state.value }, disabled: actions.disabled })
  return <section ref={setNodeRef} className={`min-h-[430px] rounded-2xl border p-3 ${isOver ? 'border-accent bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
    <div className="mb-4 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${state.dot}`} /><h2 className="text-sm font-bold text-slate-800">{state.label}</h2><span className="ml-auto rounded-md bg-white px-2 py-0.5 text-xs text-slate-500">{rows.length}</span></div>
    <div className="space-y-3">{rows.map((row) => <IntroAppointmentCard key={row.booking_id} row={row} {...actions} />)}</div>
    {!rows.length && <p className="py-12 text-center text-xs text-slate-400">Sin citas</p>}
  </section>
}

export default function IntroStatusBoard({ rows, ...actions }: AppointmentCardActions & { rows: IntroAppointment[] }) {
  return <div className="overflow-x-auto pb-3"><div className="grid min-w-[1320px] grid-cols-6 gap-3">{INTRO_STATES.map((state) => <StateColumn key={state.value} state={state} rows={rows.filter((row) => appointmentStatus(row) === state.value)} {...actions} />)}</div></div>
}
