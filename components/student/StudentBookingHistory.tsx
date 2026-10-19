'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { CalendarClock } from 'lucide-react'
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

export default function StudentBookingHistory({ studentId, scope = 'history' }: { studentId: string; scope?: 'history' | 'upcoming' }) {
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
      <p className="text-sm text-textsec">Todos tus planes. Los filtros se aplican al historial completo.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">Mes<input aria-label="Mes del historial" type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1) }} className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-white px-3" /></label>
        <label className="text-sm font-semibold">Estado<select value={status} onChange={e => { setStatus(e.target.value as HistoryStatus); setPage(1) }} className="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-white px-3">
          <option value="all">Todos</option><option value="reserved">Sin marcar</option><option value="attended">Asistidas</option><option value="cancelled">Canceladas</option><option value="no_show">No asistió</option><option value="expired_unattended">No recuperables</option>
        </select></label>
      </div>
      {(month || status !== 'all') && <button type="button" className="min-h-[44px] text-sm font-bold text-accent" onClick={() => { setMonth(''); setStatus('all'); setPage(1) }}>Limpiar filtros</button>}
    </>}
    {query.isLoading && <StudentCard className="p-5 text-sm text-textsec">Cargando clases…</StudentCard>}
    {query.isError && <StudentCard className="space-y-3 p-5"><p role="alert" className="text-sm text-danger">No se pudo cargar el historial. Inténtalo nuevamente.</p><button className="btn-outline" onClick={() => query.refetch()}>Reintentar</button></StudentCard>}
    {query.data && !query.isError && <>
      <p className="text-xs text-textsec" aria-live="polite">{query.data.total} {query.data.total === 1 ? 'clase' : 'clases'}{scope === 'history' && (month || status !== 'all') ? ' con estos filtros' : ''}</p>
      {query.data.rows.length === 0 && <StudentCard className="p-5 text-sm text-textsec">{scope === 'upcoming' ? 'No tienes reservas próximas.' : 'No hay clases para estos filtros.'}</StudentCard>}
      <div className="grid gap-3 lg:grid-cols-2">{query.data.rows.map(row => <HistoryCard key={row.booking_id} row={row} onCancel={cancel} busy={!!cancelling} />)}</div>
      {(query.data.total > query.data.pageSize || page > 1) && <div className="flex items-center justify-between gap-3">
        <button className="btn-outline min-h-[44px]" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Anterior</button>
        <span className="text-sm text-textsec">{page} / {Math.ceil(query.data.total / query.data.pageSize)}</span>
        <button className="btn-outline min-h-[44px]" disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => setPage(p => p + 1)}>Siguiente</button>
      </div>}
    </>}
  </section>
}

function HistoryCard({ row, onCancel, busy }: { row: StudentHistoryRow; onCancel: (id: string) => void; busy: boolean }) {
  const synthetic = row.event_source !== 'booking'
  const equipment = row.bow_usage_type === 'own' ? 'Arco propio' : row.bow_usage_type === 'assigned' ? 'Arco asignado' : 'Arco de academia'
  const cancellation = row.cancellation_resolution === 'no_show' ? 'Inasistencia' : row.cancellation_source === 'academy' ? 'Cancelación de academia' : row.cancellation_source === 'membership_freeze' ? 'Cancelación por congelamiento' : row.cancellation_source === 'student' ? 'Cancelación del alumno' : null
  return <StudentCard className="p-4"><div className="flex items-start gap-3">
    <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-accent" />
    <div className="min-w-0 flex-1"><p className="font-bold">{synthetic ? formatStudentHistoryDate(row.start_at) : dayjs(row.start_at).tz('America/Lima').format('ddd, D MMM YYYY')}</p>
      <p className="mt-1 text-xs text-textsec">{synthetic ? row.membership_code || 'Membresía anterior' : `${dayjs(row.start_at).tz('America/Lima').format('HH:mm')} – ${dayjs(row.end_at).tz('America/Lima').format('HH:mm')} · ${equipment}${row.distance_m ? ` · ${row.distance_m}m` : ''}`}</p>
      {synthetic && <p className="mt-2 text-xs text-textsec">{row.note}</p>}
      {cancellation && <p className="mt-2 text-xs font-semibold text-amber-700">{cancellation}</p>}
      {!synthetic && <div className="mt-3 flex flex-wrap gap-2"><Link className="btn-outline btn-sm min-h-[44px]" href={`/reserva/${row.booking_id}`}>Ver detalle</Link>
        {canStudentCancelBooking(row) && <button disabled={busy} className="btn-outline btn-sm min-h-[44px]" onClick={() => onCancel(row.booking_id)}>Cancelar reserva</button>}
      </div>}
    </div><StatusBadge status={row.status} />
  </div></StudentCard>
}
