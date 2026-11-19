'use client'

import { useRef, useState } from 'react'
import type { Dayjs } from 'dayjs'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { StudentCard } from '@/components/student/StudentCard'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useStudentMembershipBalance, useStudentMembershipCoverageEnd } from '@/lib/hooks/useStudentDashboard'
import { bookStudentSessions, fetchStudentBookingAgenda, type StudentBookingSession } from '@/lib/services/studentBookingService'
import { bookingEligibilityMessage, limaBookingDate } from '@/lib/utils/studentBooking'
import { formatStudentHistoryDate } from '@/lib/utils/studentHistoryDates'

const dateKey = (date: Dayjs) => date.format('YYYY-MM-DD')
const turnTime = (turn: StudentBookingSession) =>
  `${limaBookingDate(turn.start_at).format('HH:mm')}–${limaBookingDate(turn.end_at).format('HH:mm')}`
const turnLabel = (turn: StudentBookingSession) =>
  `${limaBookingDate(turn.start_at).format('ddd D MMM')} · ${turnTime(turn)} · ${turn.location_name}`

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50'
const navigationButton = 'grid size-11 place-items-center rounded-xl border border-blue-100 text-[#0758aa] hover:bg-blue-50'
const bookingQueryKeys = ['student-booking-agenda', 'student-booking-history', 'student-dashboard', 'student-next-booking', 'student-booking-detail', 'student-week-overview']

type Day = { date: Dayjs; turns: StudentBookingSession[] }

export function StudentReservationPlanner({ studentId, studentName }: { studentId: string; studentName?: string }) {
  const today = limaBookingDate().startOf('day')
  const currentDay = dateKey(today)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [date, setDate] = useState(today)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [selected, setSelected] = useState<StudentBookingSession[]>([])
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<{ confirmed: number; issues: { id: string; turn: string; message: string }[] } | null>(null)
  const busyRef = useRef(false)
  const reviewRef = useRef<HTMLDivElement>(null)
  const confirm = useConfirm()
  const client = useQueryClient()
  const balance = useStudentMembershipBalance(studentId)
  const coverage = useStudentMembershipCoverageEnd(studentId)
  const coverageDate = !coverage.isError && coverage.data ? formatStudentHistoryDate(coverage.data) : null

  const start = view === 'month' ? date.startOf('month') : date.subtract((date.day() + 6) % 7, 'day')
  const length = view === 'month' ? date.daysInMonth() : 7
  const from = dateKey(start)
  const to = dateKey(start.add(length - 1, 'day'))
  const agenda = useQuery({
    queryKey: ['student-booking-agenda', studentId, from, to],
    queryFn: () => fetchStudentBookingAgenda(studentId, from, to),
  })
  const turnsByDay = new Map<string, StudentBookingSession[]>()
  for (const turn of agenda.isError ? [] : agenda.data ?? []) {
    const key = dateKey(limaBookingDate(turn.start_at))
    const turns = turnsByDay.get(key) ?? []
    turns.push(turn)
    turnsByDay.set(key, turns)
  }
  const days: Day[] = Array.from({ length }, (_, index) => {
    const day = start.add(index, 'day')
    return { date: day, turns: (turnsByDay.get(dateKey(day)) ?? []).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)) }
  })
  const selectedIds = new Set(selected.map(turn => turn.session_id))
  const isSelectable = (turn: StudentBookingSession) => turn.can_book && !turn.already_reserved && Date.parse(turn.start_at) > Date.now()
  const visibleTurns = (day: Day) => availableOnly ? day.turns.filter(isSelectable) : day.turns
  const focusedDay = days.find(day => dateKey(day.date) === dateKey(date))

  function changePeriod(direction: number) {
    const next = start.add(direction * (view === 'week' ? 7 : 1), view === 'week' ? 'day' : 'month')
    setDate(today.isBefore(next, 'day') || today.isAfter(next.add(view === 'week' ? 6 : next.daysInMonth() - 1, 'day'), 'day') ? next : today)
  }

  function toggle(turn: StudentBookingSession) {
    if (busyRef.current) return
    setSelected(previous => previous.some(item => item.session_id === turn.session_id)
      ? previous.filter(item => item.session_id !== turn.session_id)
      : [...previous, turn])
    setReport(null)
  }

  async function reserve() {
    if (busyRef.current || !selected.length || agenda.isError) return
    busyRef.current = true
    setBusy(true)
    const ordered = [...selected].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
    try {
      const accepted = await confirm(
        [studentName, ...ordered.map(turn => `${turnLabel(turn)}${turn.credit_kind === 'recovery' ? ' · Recuperación' : ''}`)].filter(Boolean).join('\n'),
        {
          title: ordered.length === 1 ? 'Confirmar reserva' : `Confirmar ${ordered.length} reservas`,
          confirmLabel: 'Confirmar',
          cancelLabel: 'Revisar selección',
          description: 'Se verifica cada turno en orden de fecha según el cupo y las condiciones de tu plan. Si alguno no se puede reservar, las reservas confirmadas se conservan.',
        },
      )
      if (!accepted) return
      const results = await bookStudentSessions(studentId, ordered.map(turn => turn.session_id))
      const issues = results.flatMap((result, index) => result.status === 'confirmed' ? [] : [{
        id: result.sessionId,
        turn: turnLabel(ordered[index]),
        message: result.status === 'rejected' ? result.message : result.status === 'uncertain'
          ? 'No pudimos verificar el resultado. Revisa tus clases reservadas antes de volver a intentarlo.'
          : 'No se intentó por un problema de conexión.',
      }])
      setReport({ confirmed: results.length - issues.length, issues })
      setSelected([])
      await Promise.all(bookingQueryKeys.map(key => client.invalidateQueries({ queryKey: [key] })))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function renderTurn(turn: StudentBookingSession) {
    const checked = selectedIds.has(turn.session_id)
    const available = isSelectable(turn)
    const status = turn.already_reserved ? 'Reservada' : checked ? 'Seleccionada' : available ? 'Disponible' : 'Sin disponibilidad'
    const details = available
      ? (turn.credit_kind === 'recovery' ? 'Recuperación' : null)
      : turn.already_reserved ? null : bookingEligibilityMessage(turn.eligibility_reason, turn.eligibility_message)
    return (
      <div key={turn.session_id}>
        <button
          type="button"
          disabled={busy || (!checked && !available)}
          aria-pressed={checked}
          aria-label={`${turnLabel(turn)} · ${status}${details ? ` · ${details}` : ''}`}
          onClick={() => toggle(turn)}
          className={`flex min-h-12 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-left sm:px-2 ${checked ? 'border-orange-500 bg-orange-50' : 'border-blue-100 bg-white enabled:hover:border-blue-400 enabled:hover:bg-blue-50'}`}
        >
          <span className="font-bold tabular-nums text-slate-900">{turnTime(turn)}</span>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${checked ? 'bg-orange-100 text-orange-900' : turn.already_reserved ? 'bg-blue-100 text-blue-900' : available ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{status}</span>
          <span className="basis-full text-xs text-slate-600">{turn.location_name}{details ? ` · ${details}` : ''}</span>
        </button>
      </div>
    )
  }

  return (
    <StudentCard className="border-blue-100 p-0">
      <section id="planificador" className="scroll-mt-6" aria-labelledby="planner-title">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-t-2xl border-b border-blue-100 bg-blue-50/70 p-4 sm:p-5">
          <div>
            <h2 id="planner-title" className="flex items-center gap-2 text-xl font-bold text-[#101e3e]">
              <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-[#0758aa]" /> Planificador de reservas
            </h2>
            <p className="mt-1 text-sm text-slate-600">Selecciona los turnos que quieras reservar.</p>
          </div>
          {(!balance.isError && balance.data || coverageDate) && (
            <p className="text-sm text-slate-600">
              {!balance.isError && balance.data && <strong className="block text-[#0758aa]">{balance.data.total} clases pendientes · {balance.data.current} disponibles ahora</strong>}
              {coverageDate && <>Vigencia hasta {coverageDate}</>}
            </p>
          )}
        </div>
        <div className="space-y-4 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Vista del planificador" className="flex gap-1 rounded-xl bg-blue-50 p-1">
              {(['week', 'month'] as const).map(period => (
                <button key={period} type="button" onClick={() => setView(period)} aria-pressed={view === period} className={`min-h-11 rounded-lg px-4 text-sm font-bold ${view === period ? 'bg-[#0758aa] text-white' : 'text-[#0758aa]'}`}>
                  {period === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" className="size-4 accent-[#0758aa]" checked={availableOnly} onChange={event => setAvailableOnly(event.target.checked)} />
              Solo disponibles
            </label>
          </div>
          <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
            <button type="button" onClick={() => changePeriod(-1)} className={navigationButton} aria-label={view === 'week' ? 'Semana anterior' : 'Mes anterior'}><ChevronLeft aria-hidden="true" className="size-5" /></button>
            <p className="text-center text-sm font-bold capitalize text-[#101e3e]" aria-live="polite">
              {view === 'week' ? `${start.format('D MMM')} – ${start.add(6, 'day').format('D MMM YYYY')}` : start.format('MMMM YYYY')}
            </p>
            <button type="button" onClick={() => changePeriod(1)} className={navigationButton} aria-label={view === 'week' ? 'Semana siguiente' : 'Mes siguiente'}><ChevronRight aria-hidden="true" className="size-5" /></button>
          </div>
          {agenda.isPending ? <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">Cargando horarios…</p>
            : agenda.isError ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm" role="alert">
                {(agenda.error as { message?: string })?.message?.startsWith('Tu sede no está asignada') ? 'Tu sede aún no está asignada. Contacta a la academia.' : 'No pudimos cargar los horarios.'}{' '}
                <button type="button" onClick={() => void agenda.refetch()} className="min-h-11 font-bold text-[#0758aa] underline">Reintentar</button>
              </div>
            ) : view === 'month' ? (
              <>
                <div className="grid grid-cols-7 gap-1" aria-label="Días del mes">
                  {weekdays.map(day => <span key={day} className="text-center text-xs font-bold text-slate-600">{day}</span>)}
                  {Array.from({ length: (start.day() + 6) % 7 }, (_, index) => <span key={`empty-${index}`} />)}
                  {days.map(day => {
                    const key = dateKey(day.date)
                    const count = day.turns.filter(isSelectable).length
                    const reserved = day.turns.some(turn => turn.already_reserved)
                    const marked = day.turns.some(turn => selectedIds.has(turn.session_id))
                    const pressed = key === dateKey(date)
                    return (
                      <button key={key} type="button" onClick={() => setDate(day.date)} aria-pressed={pressed} aria-current={key === currentDay ? 'date' : undefined}
                        aria-label={`${day.date.format('dddd D [de] MMMM')}, ${count} ${count === 1 ? 'turno disponible' : 'turnos disponibles'}${reserved ? ', con reserva' : ''}${marked ? ', con selección' : ''}`}
                        className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border text-sm font-bold ${pressed ? 'border-blue-700 bg-[#0758aa] text-white' : 'border-blue-100 bg-white text-slate-800 hover:bg-blue-50'}`}>
                        {day.date.date()}
                        <span aria-hidden="true" className={`min-h-3 text-[10px] leading-3 ${pressed ? 'text-white' : reserved || marked ? 'text-blue-800' : 'text-emerald-800'}`}>{marked ? '✓' : reserved ? 'R' : count || ''}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-600">Número pequeño: turnos disponibles · R: día con reserva · ✓: día con selección</p>
                {focusedDay && <div className="space-y-2">
                  <h3 className="text-base font-bold capitalize text-[#101e3e]">{focusedDay.date.format('dddd D [de] MMMM')}</h3>
                  {visibleTurns(focusedDay).length ? <div className="grid gap-2 sm:grid-cols-2">{visibleTurns(focusedDay).map(renderTurn)}</div>
                    : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{availableOnly ? 'No hay turnos disponibles ese día.' : 'No hay turnos programados ese día.'}</p>}
                </div>}
              </>
            ) : (
              <div className="space-y-2">
                {days.every(day => !visibleTurns(day).length) && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{availableOnly ? 'No hay turnos disponibles esta semana.' : 'No hay turnos programados esta semana.'}</p>}
                <div className="grid gap-2 xl:grid-cols-7">
                  {days.map(day => (
                    <div key={dateKey(day.date)} className={`rounded-xl border border-blue-100 bg-slate-50/50 p-2 ${visibleTurns(day).length === 0 ? 'hidden xl:block' : ''}`}>
                      <h3 className="mb-2 px-1 text-sm font-bold capitalize text-[#101e3e]">{day.date.format('ddd D MMM')}</h3>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{visibleTurns(day).map(renderTurn)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          {(selected.length > 0 || report) && <div ref={reviewRef} className="scroll-mt-6 space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-3 sm:p-4">
            {selected.length > 0 && <>
              <h3 className="font-bold text-[#101e3e]">{selected.length} {selected.length === 1 ? 'turno seleccionado' : 'turnos seleccionados'}</h3>
              <ul className="divide-y divide-blue-100">
                {selected.map(turn => <li key={turn.session_id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span>{turnLabel(turn)}</span>
                  <button type="button" className="min-h-11 shrink-0 px-2 font-semibold text-[#0758aa] underline" disabled={busy} onClick={() => toggle(turn)} aria-label={`Quitar ${turnLabel(turn)}`}>Quitar</button>
                </li>)}
              </ul>
              <button type="button" onClick={() => void reserve()} disabled={busy || agenda.isError} className={`${primaryButton} w-full sm:w-auto`}>
                {busy ? 'Procesando reservas…' : selected.length === 1 ? 'Revisar y confirmar reserva' : 'Revisar y confirmar reservas'}
              </button>
            </>}
            {report && <div role="status" className="space-y-2 text-sm">
              <p className="font-bold text-[#101e3e]">{report.confirmed} {report.confirmed === 1 ? 'reserva confirmada' : 'reservas confirmadas'}</p>
              {report.issues.length > 0 && <ul className="space-y-2">
                {report.issues.map(issue => <li key={issue.id}><strong>{issue.turn}</strong><p>{issue.message}</p></li>)}
              </ul>}
              <Link href="#clases-reservadas" className="inline-flex min-h-11 items-center font-bold text-[#0758aa] underline">Ver clases reservadas</Link>
            </div>}
          </div>}
          {selected.length > 0 && (
            <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white p-2 shadow-card">
              <span className="px-1 text-sm font-bold">{selected.length} {selected.length === 1 ? 'seleccionada' : 'seleccionadas'}</span>
              <button type="button" className={primaryButton} onClick={() => reviewRef.current?.scrollIntoView({ block: 'start' })}>Ver selección</button>
            </div>
          )}
        </div>
      </section>
    </StudentCard>
  )
}
