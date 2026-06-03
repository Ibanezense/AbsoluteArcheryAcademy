'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CalendarClock, Medal } from 'lucide-react'
import { ClassCardsBoard } from '@/components/ui/ClassCardsBoard'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { useStudentClassCards } from '@/lib/hooks/useStudentClassCards'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import {
  buildBookingCutoffByDay,
  getBookingDayKey,
  hasBookingDayCutoffPassed,
} from '@/lib/utils/bookingCutoff'

type StudentBookingProfile = {
  has_own_bow: boolean
  assigned_bow: boolean
  current_distance_m: number | null
  bow_poundage: number | null
}

type AvailableSessionRow = {
  session_id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'cancelled'
  already_reserved: boolean
  distance_m: number
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own'
  slot_capacity: number
  distance_reserved: number
  bow_capacity: number | null
  bow_reserved: number | null
  spots_for_student: number
}

function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export default function ReservarPage() {
  const router = useRouter()
  const toast = useToast()
  const today = new Date()
  const [month, setMonth] = useState<Date>(startOfMonth(today))
  const [selected, setSelected] = useState<Date>(today)
  const [sessions, setSessions] = useState<AvailableSessionRow[]>([])
  const [bookingProfile, setBookingProfile] = useState<StudentBookingProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const {
    account,
    students,
    activeStudent,
    activeStudentId,
    loading: contextLoading,
  } = useStudentContext()
  const { dashboard } = useStudentDashboard(activeStudentId)
  const {
    cards: classCards,
    loading: classCardsLoading,
    error: classCardsError,
  } = useStudentClassCards(activeStudentId)

  useEffect(() => {
    if (contextLoading) return

    if (account?.role === 'guardian' && !activeStudentId) {
      router.replace('/hub')
    }
  }, [account?.role, activeStudentId, contextLoading, router])

  useEffect(() => {
    const loadBookingPage = async () => {
      if (!activeStudentId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('has_own_bow, assigned_bow, current_distance_m, bow_poundage')
          .eq('id', activeStudentId)
          .single()

        if (studentError) throw studentError
        setBookingProfile(studentData as StudentBookingProfile)

        const monthStart = startOfMonth(month)
        const monthEnd = endOfMonth(month)

        const { data: sessionsData, error: sessionsError } = await supabase.rpc(
          'get_available_sessions_for_student',
          {
            p_student_id: activeStudentId,
            p_date_from: monthStart.toISOString().slice(0, 10),
            p_date_to: monthEnd.toISOString().slice(0, 10),
          }
        )

        if (sessionsError) throw sessionsError

        const filteredSessions = (sessionsData || []).filter((session: AvailableSessionRow) => {
          const sessionDate = new Date(session.start_at)
          return sessionDate.getMonth() === month.getMonth() && sessionDate.getFullYear() === month.getFullYear()
        })

        setSessions(filteredSessions as AvailableSessionRow[])
      } catch (loadError: any) {
        toast.push({ message: loadError?.message || 'No se pudo cargar el calendario.', type: 'error' })
      } finally {
        setLoading(false)
      }
    }

    loadBookingPage()
  }, [activeStudentId, month, toast])

  const dayInfo = useMemo(() => {
    const info: Record<string, { scheduled: number; cancelled: number }> = {}
    sessions.forEach((session) => {
      const date = new Date(session.start_at)
      const key = date.toISOString().slice(0, 10)
      if (!info[key]) info[key] = { scheduled: 0, cancelled: 0 }
      if (session.status === 'scheduled') info[key].scheduled += 1
      else info[key].cancelled += 1
    })
    return info
  }, [sessions])

  const sessionsOfSelected = useMemo(() => {
    return sessions.filter((session) => sameYMD(new Date(session.start_at), selected))
  }, [sessions, selected])
  const bookingCutoffByDay = useMemo(() => buildBookingCutoffByDay(sessions), [sessions])

  if (loading || contextLoading) {
    return <StudentPageSkeleton variant="booking" />
  }

  const monthName = month.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  const isExpired = dashboard?.membership_end ? new Date(dashboard.membership_end) < new Date() : false
  const hasNoClasses = (dashboard?.classes_remaining ?? 0) <= 0
  const cannotBook = isExpired || hasNoClasses || !bookingProfile?.current_distance_m

  const first = startOfMonth(month)
  const last = endOfMonth(month)
  const firstWeekday = new Date(first).getDay()
  const grid: Date[] = []

  for (let index = 0; index < firstWeekday; index += 1) {
    const date = new Date(first)
    date.setDate(date.getDate() - (firstWeekday - index))
    grid.push(date)
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    grid.push(new Date(month.getFullYear(), month.getMonth(), day))
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader title="Reservar clase" showBack />

      <div className="space-y-5 px-4 py-5">
        {account?.role === 'guardian' && activeStudent && students.length > 1 && (
          <StudentCard className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-textsec">Reservando para</p>
              <p className="truncate font-semibold">{activeStudent.full_name}</p>
            </div>
            <button className="btn-outline btn-sm shrink-0" onClick={() => router.push('/hub')}>
              Cambiar
            </button>
          </StudentCard>
        )}

        {cannotBook && (
          <StudentCard variant="warning" className="px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-warning/15 text-lg font-black text-warning">!</span>
              <div>
                <p className="font-semibold text-warning">No puedes reservar clases</p>
                <p className="mt-1 text-sm text-textsec">
                  {isExpired
                    ? 'La membresía del alumno ha vencido. Contacta al administrador para renovarla.'
                    : hasNoClasses
                      ? 'El alumno no tiene clases disponibles. Contacta al administrador para agregar más clases.'
                      : 'El alumno no tiene distancia configurada. Contacta al administrador para habilitar reservas.'}
                </p>
              </div>
            </div>
          </StudentCard>
        )}

        <StudentCard className="p-4">
          <div className="grid grid-cols-[92px_1fr] items-center gap-4">
            <div className="grid h-[88px] w-[88px] place-items-center rounded-full border-[5px] border-accent/80 bg-white text-center shadow-inner">
              <div>
                <p className="text-3xl font-black leading-none">{dashboard?.classes_remaining ?? 0}</p>
                <p className="mt-1 px-2 text-[0.62rem] font-semibold leading-[1.05] text-textsec">clases disponibles</p>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                <SummaryItem icon={<Medal className="h-5 w-5" />} label="Plan" value={dashboard?.membership_name || '-'} />
                <SummaryItem
                  icon={<CalendarClock className="h-5 w-5" />}
                  label="Vence"
                  value={dashboard?.membership_end ? new Date(dashboard.membership_end).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                  tone="green"
                />
              </div>
              <StudentNotice className="py-2">
                Puedes cancelar desde la app hasta el inicio de la clase.
              </StudentNotice>
            </div>
          </div>
        </StudentCard>

        <section className="space-y-4">
          <div className="flex items-end gap-3">
            <h2 className="text-[1.35rem] font-black tracking-[-0.04em]">Mis clases disponibles</h2>
            <span className="pb-1 text-sm font-medium text-textsec">{dashboard?.classes_remaining ?? classCards.length} clases</span>
          </div>
          <ClassCardsBoard
            cards={classCards}
            loading={classCardsLoading}
            error={classCardsError}
            canReserve={!cannotBook}
            studentId={activeStudentId}
          />
        </section>

        <div className="grid gap-4">
          <StudentCard className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black">Calendario de turnos</h2>
                <span className="text-sm font-medium capitalize text-textsec">{monthName}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-outline grid min-h-[44px] min-w-[44px] place-items-center !p-0"
                  onClick={() => setMonth(addMonths(month, -1))}
                  aria-label="Mes anterior"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <button
                  className="btn-outline grid min-h-[44px] min-w-[44px] place-items-center !p-0"
                  onClick={() => setMonth(addMonths(month, 1))}
                  aria-label="Mes siguiente"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-7 text-center text-xs text-textsec">
              <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((date, index) => {
                const inMonth = date.getMonth() === month.getMonth()
                if (!inMonth) return <div key={index} className="h-10" />

                const key = date.toISOString().slice(0, 10)
                const info = dayInfo[key]
                const isToday = sameYMD(date, today)
                const isSelected = sameYMD(date, selected)

                let bg = 'bg-white'
                let ring = ''
                if (info?.cancelled && !info?.scheduled) bg = 'bg-danger/10'
                else if (info?.scheduled) bg = 'bg-accent/8'
                if (isToday) ring = 'ring-2 ring-accent'
                if (isSelected) ring = 'ring-2 ring-accent/60 bg-accent/10'

                return (
                  <button
                    key={index}
                    onClick={() => setSelected(date)}
                    className={`grid h-10 place-items-center rounded-xl ${bg} ${ring} transition-all`}
                  >
                    <span className="text-sm font-semibold">{date.getDate()}</span>
                    {info?.scheduled ? <span className="block h-1.5 w-1.5 rounded-full bg-accent" /> : <span className="block h-1.5 w-1.5" />}
                  </button>
                )
              })}
            </div>
          </StudentCard>

          <StudentCard className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-green-50 text-success">
                <CalendarClock className="h-5 w-5" />
              </span>
              <h2 className="font-black">Horarios disponibles</h2>
            </div>
            <div className="grid gap-2">
              {sessionsOfSelected.length === 0 && (
                <div className="text-sm text-textsec">No hay turnos para este día.</div>
              )}

              {sessionsOfSelected.map((session) => {
                const start = new Date(session.start_at)
                const end = new Date(session.end_at)
                const spots = session.spots_for_student
                const isPast = start.getTime() <= Date.now()
                const bookingDayCutoffAt = bookingCutoffByDay[getBookingDayKey(session.start_at)]
                const isDayClosed = hasBookingDayCutoffPassed(bookingDayCutoffAt)
                const isAvailable = session.status === 'scheduled' && !session.already_reserved && spots > 0 && !isPast && !isDayClosed

                return (
                  <div key={session.session_id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5">
                    <div>
                      <p className="font-semibold">
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className={`text-xs font-medium ${isAvailable ? 'text-success' : 'text-textsec'}`}>
                        {session.status === 'cancelled'
                          ? 'Cancelado'
                          : isPast
                            ? 'Turno iniciado'
                            : isDayClosed
                              ? 'Reservas cerradas'
                              : session.already_reserved
                                ? 'Ya reservado'
                                : spots > 0
                                  ? `${spots} ${spots === 1 ? 'cupo' : 'cupos'} disponibles`
                                  : 'Completo'}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${isAvailable ? 'text-success' : 'text-textsec'}`}>
                      {isAvailable ? `${spots} cupos` : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          </StudentCard>
        </div>
      </div>
    </div>
  )
}

function SummaryItem({
  icon,
  label,
  value,
  tone = 'orange',
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: 'orange' | 'green'
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-r border-line last:border-r-0">
      <span className={tone === 'green' ? 'grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-50 text-success' : 'grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent'}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-textsec">{label}</p>
        <p className="text-sm font-black leading-tight">{value}</p>
      </div>
    </div>
  )
}
