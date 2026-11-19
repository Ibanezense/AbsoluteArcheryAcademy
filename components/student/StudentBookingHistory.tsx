'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { CalendarClock, Info } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { StudentCard } from '@/components/student/StudentCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudentBookingHistory } from '@/lib/hooks/useStudentBookingHistory'
import type { HistoryStatus, StudentHistoryRow } from '@/lib/services/studentBookingHistoryService'
import { canStudentCancelBooking } from '@/lib/utils/bookingCancellation'
import { formatStudentHistoryDate } from '@/lib/utils/studentHistoryDates'
import { supabase } from '@/lib/supabaseClient'

export default function StudentBookingHistory({ studentId, scope = 'history', compact = false }: { studentId: string; scope?: 'history' | 'upcoming'; compact?: boolean }) {
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState<HistoryStatus>('all')
  const [page, setPage] = useState(1)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const query = useStudentBookingHistory(studentId, { scope, month: scope === 'history' ? month : '', status: scope === 'history' ? status : 'all', page })
  const cancellationLock = useRef(false)
  const client = useQueryClient()
  const confirm = useConfirm()
  const toast = useToast()
  const cancel = async (id: string) => {
    if (cancellationLock.current) return
    cancellationLock.current = true
    try {
      if (!(await confirm('La cancelación liberará el cupo y el crédito inmediatamente.'))) return
      setCancelling(id)
      const { error } = await supabase.rpc('cancel_booking', { p_booking: id })
      if (error) throw error
      await Promise.all([
        'student-booking-history', 'student-booking-agenda', 'student-booking-detail',
        'student-dashboard', 'student-week-overview', 'student-next-booking',
      ].map(key => client.invalidateQueries({ queryKey: [key] })))
      setPage(1)
      toast.push({ message: 'Reserva cancelada. El crédito está disponible nuevamente.', type: 'success' })
    } catch (error) { toast.push({ message: error instanceof Error ? error.message : 'No se pudo cancelar la reserva.', type: 'error' }) }
    finally { setCancelling(null); cancellationLock.current = false }
  }
  return <section className="space-y-3" aria-label={scope === 'upcoming' ? 'Próximas reservas' : 'Historial completo de clases'}>
    {scope === 'history' && <>
      {!compact && <p className="text-sm text-textsec">Todos tus planes. Los filtros se aplican al historial completo.</p>}
      {compact && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado de las clases">
        {([['all', 'Todas'], ['attended', 'Asistidas'], ['cancelled', 'Canceladas']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={status === value}
            onClick={() => { setStatus(value); setPage(1) }}
            className={`min-h-11 rounded-lg border border-blue-100 px-3 text-sm font-semibold ${status === value ? 'bg-[#0758aa] text-white' : 'bg-blue-50 text-[#0758aa]'}`}>{label}</button>
        ))}
      </div>}
      <div className={compact ? 'max-w-56' : 'grid grid-cols-2 gap-3'}>
        <label className="text-sm font-semibold">Mes<input aria-label="Mes del historial" type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1) }} className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-white px-3" /></label>
        {!compact && <label className="text-sm font-semibold">Estado<select value={status} onChange={e => { setStatus(e.target.value as HistoryStatus); setPage(1) }} className="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-white px-3">
          <option value="all">Todos</option><option value="reserved">Sin marcar</option><option value="attended">Asistidas</option><option value="cancelled">Canceladas</option><option value="no_show">No asistió</option><option value="expired_unattended">No recuperables</option>
        </select></label>}
      </div>
      {(month || status !== 'all') && <button type="button" className="min-h-[44px] text-sm font-bold text-accent" onClick={() => { setMonth(''); setStatus('all'); setPage(1) }}>Limpiar filtros</button>}
    </>}
    {query.isLoading && <StudentCard className="p-5 text-sm text-textsec">Cargando clases…</StudentCard>}
    {query.isError && <StudentCard className="space-y-3 p-5"><p role="alert" className="text-sm text-danger">No se pudo cargar el historial. Inténtalo nuevamente.</p><button className="btn-outline" onClick={() => query.refetch()}>Reintentar</button></StudentCard>}
    {query.data && !query.isError && <>
      <p className="text-xs text-textsec" aria-live="polite">{query.data.total} {query.data.total === 1 ? 'clase' : 'clases'}{scope === 'history' && (month || status !== 'all') ? ' con estos filtros' : ''}</p>
      {query.data.rows.length === 0 && <StudentCard className="p-5 text-sm text-textsec">{scope === 'upcoming' ? 'No tienes reservas próximas.' : 'No hay clases para estos filtros.'}</StudentCard>}
      <div className={compact ? 'grid gap-2' : 'grid gap-3 lg:grid-cols-2'}>{query.data.rows.map(row => (
        <HistoryCard key={row.booking_id} row={row} onCancel={cancel} busy={!!cancelling} layout={compact ? scope : 'default'} />
      ))}</div>
      {(query.data.total > query.data.pageSize || page > 1) && <div className="flex items-center justify-between gap-3">
        <button className="btn-outline min-h-[44px]" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Anterior</button>
        <span className="text-sm text-textsec">{page} / {Math.ceil(query.data.total / query.data.pageSize)}</span>
        <button className="btn-outline min-h-[44px]" disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => setPage(p => p + 1)}>Siguiente</button>
      </div>}
    </>}
  </section>
}

function HistoryCard({ row, onCancel, busy, layout }: { row: StudentHistoryRow; onCancel: (id: string) => void; busy: boolean; layout: 'history' | 'upcoming' | 'default' }) {
  const synthetic = row.event_source !== 'booking'
  const classExpired = row.status === 'expired_unattended'
  const equipment = row.bow_usage_type === 'own' ? 'Arco propio' : row.bow_usage_type === 'assigned' ? 'Arco asignado' : 'Arco de academia'
  const cancellation = row.status === 'attended' ? null : row.cancellation_resolution === 'no_show' ? 'Inasistencia' : row.cancellation_source === 'academy' ? 'Cancelación de academia' : row.cancellation_source === 'membership_freeze' ? 'Cancelación por congelamiento' : row.cancellation_source === 'student' ? 'Cancelación del alumno' : null
  const date = synthetic ? formatStudentHistoryDate(row.start_at) : dayjs(row.start_at).tz('America/Lima').format('ddd, D MMM YYYY')
  return <StudentCard className={layout !== 'default' ? 'border-blue-100 p-3' : 'p-4'}><div className="flex flex-wrap items-start gap-x-2 gap-y-1">
    <CalendarClock aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#0758aa]" />
    <div className="min-w-0 flex-1">{layout === 'history' && !synthetic
      ? <Link className="inline-flex min-h-11 items-center font-bold text-[#0758aa] hover:underline sm:min-h-0" href={`/reserva/${row.booking_id}`}>{date}</Link>
      : <p className="font-bold">{date}</p>}
      <p className="mt-1 text-xs text-textsec">{synthetic ? row.membership_code || 'Membresía anterior' : `${dayjs(row.start_at).tz('America/Lima').format('HH:mm')} – ${dayjs(row.end_at).tz('America/Lima').format('HH:mm')} · ${equipment}${row.distance_m ? ` · ${row.distance_m}m` : ''}`}</p>
      {synthetic && !classExpired && row.note && <p className="mt-2 text-xs text-textsec">{row.note}</p>}
      {cancellation && <p className="mt-2 text-xs font-semibold text-amber-700">{cancellation}</p>}
    </div>
    {layout === 'upcoming' ? <StatusBadge status="confirmed" label="Reservada" />
      : classExpired ? <ExpiredClassInfo />
        : layout === 'history' && row.status === 'cancelled'
        ? <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">Cancelada</span>
        : <StatusBadge status={row.status} />}
  </div>
    {!synthetic && layout !== 'history' && (
      <div role="group" aria-label="Acciones de la reserva" className="mt-2 flex items-center gap-2">
        <Link className="btn-outline btn-sm min-h-11" href={`/reserva/${row.booking_id}`}>Ver detalle</Link>
        {canStudentCancelBooking(row) && <button type="button" disabled={busy} className="btn-outline btn-sm min-h-11" onClick={() => onCancel(row.booking_id)}>Cancelar reserva</button>}
      </div>
    )}
  </StudentCard>
}

function ExpiredClassInfo() {
  const [open, setOpen] = useState(false)
  const descriptionId = useId()
  return (
    <div className="relative flex items-center">
      <StatusBadge status="expired_unattended" label="No recuperada" />
      <button
        type="button"
        aria-label="Por qué se perdió esta clase"
        aria-expanded={open}
        aria-controls={descriptionId}
        aria-describedby={open ? descriptionId : undefined}
        onClick={() => setOpen(value => !value)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
        className="grid size-11 shrink-0 place-items-center rounded-full text-[#0758aa] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
      >
        <Info aria-hidden="true" className="size-5" />
      </button>
      <p id={descriptionId} role="tooltip" hidden={!open} className="absolute right-0 top-full z-20 w-56 max-w-[calc(100vw-4rem)] rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-800 shadow-lg">
        La clase se perdió porque no se recuperó durante la vigencia de la membresía.
      </p>
    </div>
  )
}
