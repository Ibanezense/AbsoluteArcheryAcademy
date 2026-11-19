"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CalendarClock, MapPin, Target } from 'lucide-react'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard, useStudentMembershipCoverageEnd } from '@/lib/hooks/useStudentDashboard'
import { supabase } from '@/lib/supabaseClient'
import { fetchStudentBookingAgenda, fetchStudentBookingChangeWindow, fetchStudentDayCutoffs, type StudentBookingSession } from '@/lib/services/studentBookingService'
import { bookingConfirmationText, bookingEligibilityMessage, canStudentChangeBooking, limaBookingDate } from '@/lib/utils/studentBooking'
import { formatStudentHistoryDate } from '@/lib/utils/studentHistoryDates'

export default function StudentBookingAgendaPage({ moveBookingId }: { moveBookingId?: string }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { account, activeStudent, activeStudentId, loading: contextLoading } = useStudentContext()
  const { dashboard } = useStudentDashboard(moveBookingId ? null : activeStudentId)
  const coverage = useStudentMembershipCoverageEnd(moveBookingId ? null : activeStudentId)
  const originalQuery = useQuery({
    queryKey: ['student-booking-detail', activeStudentId, moveBookingId, 'change-window'],
    queryFn: () => fetchStudentBookingChangeWindow(moveBookingId!, activeStudentId!),
    enabled: !!moveBookingId && !!activeStudentId,
  })
  const original = originalQuery.data
  const canMove = !originalQuery.isError && !!original && canStudentChangeBooking(original, original.booking_day_cutoff_at)
  const coverageDate = coverage.isError ? null : formatStudentHistoryDate(coverage.data ?? null)

  const [weekStart, setWeekStart] = useState(() => {
    const today = limaBookingDate()
    return today.subtract((today.day() || 7) - 1, 'day').startOf('day')
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const actionInProgress = useRef(false)
  const selectedStudent = useRef(activeStudentId)
  selectedStudent.current = activeStudentId
  const { data: sessions = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ['student-booking-agenda', activeStudentId, weekStart.format('YYYY-MM-DD')],
    queryFn: () => fetchStudentBookingAgenda(activeStudentId!, weekStart.format('YYYY-MM-DD'), weekStart.add(6, 'day').format('YYYY-MM-DD')),
    enabled: !!activeStudentId && !contextLoading && (!moveBookingId || canMove),
  })

  useEffect(() => {
    if (!contextLoading && account?.role === 'guardian' && !activeStudentId) router.replace('/hub')
  }, [account?.role, activeStudentId, contextLoading, router])

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => ({
    date: weekStart.add(index, 'day'),
    sessions: sessions.filter((session) => limaBookingDate(session.start_at).format('YYYY-MM-DD') === weekStart.add(index, 'day').format('YYYY-MM-DD')),
  })).filter((day) => day.sessions.length > 0), [sessions, weekStart])

  const dayKeys = days.map(({ date }) => date.format('YYYY-MM-DD'))
  const cutoffsQuery = useQuery({
    queryKey: ['student-booking-change-cutoffs', dayKeys],
    queryFn: () => fetchStudentDayCutoffs(dayKeys),
    enabled: !!moveBookingId && canMove && dayKeys.length > 0,
  })

  function canSelect(session: StudentBookingSession) {
    if (!moveBookingId) return session.can_book
    const cutoff = cutoffsQuery.isError ? undefined : cutoffsQuery.data?.[limaBookingDate(session.start_at).format('YYYY-MM-DD')]
    return canMove && !!original && canStudentChangeBooking(original, original.booking_day_cutoff_at)
      && !session.already_reserved && session.status === 'scheduled'
      && canStudentChangeBooking({ status: 'reserved', start_at: session.start_at }, cutoff)
  }

  const reserve = async (session: StudentBookingSession) => {
    if (!activeStudentId || actionInProgress.current || !canSelect(session)) return
    actionInProgress.current = true
    setSavingId(session.session_id)
    const studentId = activeStudentId
    try {
      const destination = limaBookingDate(session.start_at)
      const accepted = await confirm(moveBookingId
        ? `${session.location_name} · ${destination.format('dddd D [de] MMMM, HH:mm')}. Conservas tu reserva si el cambio no se puede completar.`
        : bookingConfirmationText({
        fullName: activeStudent?.full_name || dashboard?.full_name || 'Alumno seleccionado',
        locationName: session.location_name, locationAddress: session.location_address,
        startAt: session.start_at, endAt: session.end_at, creditKind: session.credit_kind,
      }), {
        title: moveBookingId ? 'Confirmar cambio de turno' : 'Confirmar reserva',
        confirmLabel: moveBookingId ? 'Confirmar cambio' : 'Confirmar reserva',
        cancelLabel: 'Volver a la agenda',
        description: moveBookingId ? 'Verificaremos el cupo y el equipo al confirmar.' : 'Los cupos y las condiciones de tu membresía se verifican de nuevo al confirmar.',
      })
      if (!accepted || selectedStudent.current !== studentId || !canSelect(session)) return
      const { data, error: bookingError } = moveBookingId
        ? await supabase.rpc('update_booking_session', { p_booking_id: moveBookingId, p_new_session_id: session.session_id })
        : await supabase.rpc('book_session_multisite', { p_session: session.session_id, p_student_id: studentId })
      if (bookingError) throw bookingError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-booking-agenda'] }),
        queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['student-booking-history'] }),
        queryClient.invalidateQueries({ queryKey: ['student-next-booking'] }),
        queryClient.invalidateQueries({ queryKey: ['student-booking-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['student-week-overview'] }),
      ])
      toast.push({ message: moveBookingId ? `Reserva cambiada a ${session.location_name}.` : `Reserva confirmada en ${session.location_name}.`, type: 'success' })
      const bookingId = moveBookingId ?? (Array.isArray(data) ? data[0]?.id : data?.id)
      if (bookingId) router.push(`/reserva/${bookingId}`)
    } catch (bookingError: unknown) {
      const message = bookingError && typeof bookingError === 'object' && 'message' in bookingError ? String(bookingError.message) : 'No se pudo completar la reserva. Intenta nuevamente.'
      toast.push({ message, type: 'error' })
      void refetch()
      if (moveBookingId) { void originalQuery.refetch(); void cutoffsQuery.refetch() }
    } finally {
      actionInProgress.current = false
      setSavingId(null)
    }
  }

  if (contextLoading || loading || (moveBookingId && activeStudentId && originalQuery.isLoading)) return <StudentPageSkeleton variant="booking" />

  const agendaError = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''

  return (
    <div className="min-h-screen bg-bg text-textpri">
      <MobileStudentHeader title={moveBookingId ? "Cambiar turno" : "Reservar clase"} subtitle={moveBookingId ? "Elige un nuevo horario para tu reserva" : "Elige tu próximo entrenamiento"} showBack />
      <div className="space-y-5 px-4 py-5 md:px-6">
        {account?.role === 'guardian' && activeStudent && <StudentCard className="p-4 text-sm">Alumno: <strong>{activeStudent.full_name}</strong></StudentCard>}
        {moveBookingId && <StudentCard className="space-y-2 p-4">
          {original && <p className="text-sm"><strong>Tu reserva:</strong> {limaBookingDate(original.start_at).format('dddd D [de] MMMM, HH:mm')}</p>}
          {originalQuery.isError ? <p role="alert" className="text-sm">No pudimos comprobar el plazo. <button className="font-semibold text-blue-700 underline" onClick={() => void originalQuery.refetch()}>Reintentar</button></p>
            : !canMove ? <p role="status" className="text-sm">Esta reserva ya no se puede cambiar. En el detalle puedes consultar si aún puedes cancelarla.</p>
            : original?.booking_day_cutoff_at && <p className="text-sm">Puedes cambiar hasta el {limaBookingDate(original.booking_day_cutoff_at).format('D [de] MMMM [a las] HH:mm')}.</p>}
          <Link href={`/reserva/${moveBookingId}`} className="inline-flex min-h-11 items-center text-sm font-bold text-blue-700">Ver reserva actual</Link>
        </StudentCard>}
        {(!moveBookingId || canMove) && <>
        <StudentCard className="overflow-hidden p-0">
          <div className="sport-dark p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div><h2 className="text-2xl font-bold text-white">Agenda semanal</h2><p className="mt-1 text-sm text-slate-300">{moveBookingId ? 'Elige el turno al que quieres mover tu reserva.' : 'Revisa los horarios y confirma los detalles antes de reservar.'}</p></div>
            {!moveBookingId && dashboard && <p className="mt-3 shrink-0 text-sm sm:mt-0"><strong className="text-orange-200">{dashboard.classes_remaining ?? '—'} clases disponibles</strong><br /><span className="text-slate-300">{coverage.isLoading ? 'Consultando vigencia…' : coverageDate ? `Vigencia hasta ${coverageDate}` : 'Consulta tu membresía'} · <Link className="underline underline-offset-2" href="/membresias">Ver plan</Link></span></p>}
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <button type="button" className="btn-outline btn-sm" onClick={() => setWeekStart((date) => date.subtract(7, 'day'))} aria-label="Semana anterior"><ArrowLeft className="h-4 w-4" /></button>
            <p className="text-center text-sm font-black capitalize">{weekStart.format('D MMM')} – {weekStart.add(6, 'day').format('D MMM YYYY')}</p>
            <button type="button" className="btn-outline btn-sm" onClick={() => setWeekStart((date) => date.add(7, 'day'))} aria-label="Semana siguiente"><ArrowRight className="h-4 w-4" /></button>
          </div>
        </StudentCard>
        {moveBookingId && cutoffsQuery.isError && <StudentCard className="p-4 text-sm">
          No se pudieron comprobar los plazos de esta semana. <button type="button" onClick={() => void cutoffsQuery.refetch()} className="font-semibold text-blue-700 underline">Reintentar</button>
        </StudentCard>}
        {error ? <StudentCard className="space-y-3 p-5"><p role="alert" className="text-sm text-rose-700">{agendaError.includes('Tu sede no está asignada') ? agendaError : 'No pudimos consultar los horarios y las condiciones de tu membresía.'}</p><button type="button" className="btn-outline btn-sm" onClick={() => void refetch()}>Reintentar</button></StudentCard> : !activeStudentId ? <StudentNotice>Selecciona un alumno para consultar sus horarios.</StudentNotice> : days.length === 0 ? <StudentCard className="p-6 text-center text-sm text-textsec">No hay turnos programados disponibles esta semana.</StudentCard> : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {days.map(({ date, sessions: daySessions }) => (
              <section key={date.format('YYYY-MM-DD')} className="space-y-3" aria-label={date.format('dddd D [de] MMMM')}>
                <h2 className="px-1 text-xl font-bold capitalize text-slate-700">{date.format('dddd D [de] MMMM')}</h2>
                {daySessions.map((session) => {
                  const selectable = canSelect(session)
                  return (
                  <StudentCard key={session.session_id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent"><CalendarClock className="h-6 w-6" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-black">{limaBookingDate(session.start_at).format('HH:mm')} – {limaBookingDate(session.end_at).format('HH:mm')}</p>
                        <p className="mt-1 flex items-start gap-1 text-sm text-textsec"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{session.location_name}{session.location_address ? ` · ${session.location_address}` : ''}</span></p>
                        <p className="mt-1 flex items-start gap-1 text-sm text-textsec"><Target className="mt-0.5 h-4 w-4 shrink-0" /><span>{session.distance_m ? `${session.distance_m} m · ` : ''}{session.bow_usage_type === 'own' ? 'Equipo propio' : session.bow_usage_type === 'assigned' ? 'Arco asignado' : 'Arco de academia'}</span></p>
                        <p className={`mt-2 text-xs font-bold ${session.can_book ? 'text-emerald-700' : 'text-slate-600'}`}>{moveBookingId ? (session.already_reserved ? 'Ya tienes reserva en este turno' : cutoffsQuery.isPending ? 'Consultando plazo…' : selectable ? 'Cupo y equipo se verifican al confirmar' : 'Turno no habilitado para cambios') : session.can_book ? `${session.spots_for_student} cupo${session.spots_for_student === 1 ? '' : 's'} compatible${session.spots_for_student === 1 ? '' : 's'}` : bookingEligibilityMessage(session.eligibility_reason, session.eligibility_message)}</p>
                        {!moveBookingId && session.eligibility_reason === 'membership_dates' && <Link className="mt-2 inline-block text-sm font-bold text-accent underline underline-offset-2" href="/membresias#renovacion">Revisar renovación</Link>}
                      </div>
                    </div>
                    <button type="button" className="btn mt-4 w-full" disabled={!selectable || savingId !== null} onClick={() => void reserve(session)}>{session.already_reserved ? 'Ya reservaste este turno' : savingId === session.session_id ? 'Procesando…' : selectable ? (moveBookingId ? 'Cambiar a este turno' : 'Reservar este turno') : moveBookingId ? 'No disponible para cambios' : 'No disponible para reservar'}</button>
                  </StudentCard>
                  )
                })}
              </section>
            ))}
          </div>
        )}
        </>}
      </div>
    </div>
  )
}
