'use client'

import { useDraggable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { GripVertical, MapPin, Pencil } from 'lucide-react'
import { INTRO_STATES, appointmentStatus, calendarTime, type IntroAppointment } from '@/lib/utils/introCalendar'

export type AppointmentCardActions = {
  onSelect: (row: IntroAppointment) => void
  onEdit: (row: IntroAppointment) => void
  disabled: boolean
}

type CardProps = AppointmentCardActions & { row: IntroAppointment; overlay?: boolean }

function CardContent({ row, onSelect, onEdit, disabled, overlay = false, nodeRef, dragHandle, isDragging }: CardProps & {
  nodeRef?: (node: HTMLElement | null) => void; dragHandle?: ReactNode; isDragging?: boolean;
}) {
  const state = INTRO_STATES.find((item) => item.value === appointmentStatus(row))!
  return (
    <article ref={nodeRef} data-appointment-id={overlay ? undefined : row.booking_id} className={`group relative rounded-xl border bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md ${isDragging ? 'opacity-30' : ''} ${overlay ? 'w-56 rotate-2 border-accent shadow-xl' : 'border-slate-200'}`}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-semibold text-slate-700">{calendarTime(row.session_start)}</span>
        <div className="flex items-center">
          <button type="button" disabled={disabled} onClick={() => onEdit(row)} aria-label={`Editar cita de ${row.full_name}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"><Pencil size={13} /></button>
          {dragHandle}
        </div>
      </div>
      <button type="button" onClick={() => onSelect(row)} disabled={disabled} className="block w-full text-left focus-visible:outline-accent">
        <span className="block text-sm font-bold leading-snug text-slate-900">{row.full_name}</span>
        <span className="mt-1 block text-[11px] text-slate-500">{row.age} años</span>
        <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><MapPin size={11} />{row.location_name}</span>
        <span className={`mt-3 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${state.color}`}>{state.label}</span>
        {row.payment_status === 'pending' && <span className="mt-1.5 block text-[11px] font-medium text-amber-700">{row.pay_on_site ? 'Paga en sede' : appointmentStatus(row) !== 'pending' ? 'Por pagar' : 'Pago pendiente'} · S/ {Number(row.amount_paid || 0).toFixed(2)}</span>}
        {row.payment_status === 'paid' && appointmentStatus(row) !== 'paid' && <span className="mt-1.5 block text-[11px] text-emerald-700">Pagado · S/ {Number(row.amount_paid || 0).toFixed(2)}</span>}
      </button>
    </article>
  )
}

function DraggableCard(props: CardProps) {
  const { row, disabled } = props
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `appointment:${row.booking_id}`, data: { row }, disabled,
  })
  return <CardContent {...props} nodeRef={setNodeRef} isDragging={isDragging} dragHandle={
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled} aria-label={`Mover cita de ${row.full_name}`} className="touch-none rounded-md p-1.5 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"><GripVertical size={15} /></button>
  } />
}

export default function IntroAppointmentCard(props: CardProps) {
  return props.overlay ? <CardContent {...props} /> : <DraggableCard {...props} />
}
