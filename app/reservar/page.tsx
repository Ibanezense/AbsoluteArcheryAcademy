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
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { supabase } from '@/lib/supabaseClient'
import { fetchStudentBookingAgenda, type StudentBookingSession } from '@/lib/services/studentBookingService'
import { bookingConfirmationText, bookingEligibilityMessage, limaBookingDate } from '@/lib/utils/studentBooking'

export default function ReservarPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { account, activeStudent, activeStudentId, loading: contextLoading } = useStudentContext()
  const { dashboard } = useStudentDashboard(activeStudentId)
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
    enabled: !!activeStudentId && !contextLoading,
  })

  useEffect(() => {
    if (!contextLoading && account?.role === 'guardian' && !activeStudentId) router.replace('/hub')
  }, [account?.role, activeStudentId, contextLoading, router])

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => ({
    date: weekStart.add(index, 'day'),
    sessions: sessions.filter((session) => limaBookingDate(session.start_at).format('YYYY-MM-DD') === weekStart.add(index, 'day').format('YYYY-MM-DD')),
  })).filter((day) => day.sessions.length > 0), [sessions, weekStart])

  const reserve = async (session: StudentBookingSession) => {
    if (!activeStudentId || actionInProgress.current || !session.can_book) return
    actionInProgress.current = true
    setSavingId(session.session_id)
    const studentId = activeStudentId
    try {
      const accepted = await confirm(bookingConfirmationText({
        fullName: activeStudent?.full_name || dashboard?.full_name || 'Alumno seleccionado',
        locationName: session.location_name, locationAddress: session.location_address,
        startAt: session.start_at, endAt: session.end_at, creditKind: session.credit_kind,
      }), { title: 'Confirmar reserva', confirmLabel: 'Confirmar reserva', cancelLabel: 'Volver a la agenda', description: 'Los cupos y las condiciones de tu membresía se verifican de nuevo al confirmar.' })
      if (!accepted || selectedStudent.current !== studentId) return
      const { data, error: bookingError } = await supabase.rpc('book_session_multisite', { p_session: session.session_id, p_student_id: studentId })
      if (bookingError) throw bookingError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-booking-agenda'] }),
        queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['student-booking-history'] }),
        queryClient.invalidateQueries({ queryKey: ['student-next-booking'] }),
        queryClient.invalidateQueries({ queryKey: ['student-week-overview'] }),
      ])
      toast.push({ message: `Reserva confirmada en ${session.location_name}.`, type: 'success' })
      const bookingId = Array.isArray(data) ? data[0]?.id : data?.id
      if (bookingId) router.push(`/reserva/${bookingId}`)
    } catch (bookingError: unknown) {
      const message = bookingError && typeof bookingError === 'object' && 'message' in bookingError ? String(bookingError.message) : 'No se pudo completar la reserva. Intenta nuevamente.'
      toast.push({ message, type: 'error' })
      void refetch()
    } finally {
      actionInProgress.current = false
      setSavingId(null)
    }
  }

  if (contextLoading || loading) return <StudentPageSkeleton variant="booking" />

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader title="Reservar clase" subtitle="Elige tu próximo entrenamiento" showBack />
      <div className="space-y-5 px-4 py-5 md:px-6">
        {account?.role === 'guardian' && activeStudent && <StudentCard className="p-4 text-sm">Reservando para <strong>{activeStudent.full_name}</strong></StudentCard>}
        <StudentCard className="overflow-hidden p-0">
          <div className="bg-[#07111d] p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div><h2 className="text-xl font-black">Agenda semanal</h2><p className="mt-1 text-sm text-slate-300">Revisa los horarios y confirma los detalles antes de reservar.</p></div>
            {dashboard && <p className="mt-3 shrink-0 text-sm sm:mt-0"><strong className="text-orange-200">{dashboard.classes_remaining ?? '—'} clases disponibles</strong><br /><span className="text-slate-300">{dashboard.membership_end ? `Vigencia hasta ${dashboard.membership_end.split('-').reverse().join('/')}` : 'Consulta tu membresía'} · <Link className="underline underline-offset-2" href="/membresias">Ver plan</Link></span></p>}
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <button type="button" className="btn-outline btn-sm" onClick={() => setWeekStart((date) => date.subtract(7, 'day'))} aria-label="Semana anterior"><ArrowLeft className="h-4 w-4" /></button>
            <p className="text-center text-sm font-black capitalize">{weekStart.format('D MMM')} – {weekStart.add(6, 'day').format('D MMM YYYY')}</p>
            <button type="button" className="btn-outline btn-sm" onClick={() => setWeekStart((date) => date.add(7, 'day'))} aria-label="Semana siguiente"><ArrowRight className="h-4 w-4" /></button>
          </div>
        </StudentCard>
        {error ? <StudentCard className="space-y-3 p-5"><p role="alert" className="text-sm text-rose-700">No pudimos consultar los horarios y las condiciones de tu membresía.</p><button type="button" className="btn-outline btn-sm" onClick={() => void refetch()}>Reintentar</button></StudentCard> : !activeStudentId ? <StudentNotice>Selecciona un alumno para consultar sus horarios.</StudentNotice> : days.length === 0 ? <StudentCard className="p-6 text-center text-sm text-textsec">No hay turnos programados disponibles esta semana.</StudentCard> : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {days.map(({ date, sessions: daySessions }) => (
              <section key={date.format('YYYY-MM-DD')} className="space-y-3" aria-label={date.format('dddd D [de] MMMM')}>
                <h2 className="px-1 text-sm font-black capitalize text-slate-700">{date.format('dddd D [de] MMMM')}</h2>
                {daySessions.map((session) => (
                  <StudentCard key={session.session_id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent"><CalendarClock className="h-6 w-6" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-black">{limaBookingDate(session.start_at).format('HH:mm')} – {limaBookingDate(session.end_at).format('HH:mm')}</p>
                        <p className="mt-1 flex items-start gap-1 text-sm text-textsec"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{session.location_name}{session.location_address ? ` · ${session.location_address}` : ''}</span></p>
                        <p className="mt-1 flex items-start gap-1 text-sm text-textsec"><Target className="mt-0.5 h-4 w-4 shrink-0" /><span>{session.distance_m ? `${session.distance_m} m · ` : ''}{session.bow_usage_type === 'own' ? 'Equipo propio' : session.bow_usage_type === 'assigned' ? 'Arco asignado' : 'Arco de academia'}</span></p>
                        <p className={`mt-2 text-xs font-bold ${session.can_book ? 'text-emerald-700' : 'text-slate-600'}`}>{session.can_book ? `${session.spots_for_student} cupo${session.spots_for_student === 1 ? '' : 's'} compatible${session.spots_for_student === 1 ? '' : 's'}` : bookingEligibilityMessage(session.eligibility_reason, session.eligibility_message)}</p>
                        {session.eligibility_reason === 'membership_dates' && <Link className="mt-2 inline-block text-sm font-bold text-accent underline underline-offset-2" href="/membresias#renovacion">Revisar renovación</Link>}
                      </div>
                    </div>
                    <button type="button" className="btn mt-4 w-full" disabled={!session.can_book || savingId !== null} onClick={() => void reserve(session)}>{session.already_reserved ? 'Ya reservaste este turno' : savingId === session.session_id ? 'Revisando reserva…' : session.can_book ? 'Reservar este turno' : 'No disponible para reservar'}</button>
                  </StudentCard>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
