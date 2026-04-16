'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { useStudentClassCards } from '@/lib/hooks/useStudentClassCards'
import { ClassCardsBoard } from '@/components/ui/ClassCardsBoard'
import { useToast } from '@/components/ui/ToastProvider'
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
  const [booking, setBooking] = useState(false)

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
      return
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

        if (studentError) {
          throw studentError
        }

        const studentProfile = studentData as StudentBookingProfile
        setBookingProfile(studentProfile)

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

        if (sessionsError) {
          throw sessionsError
        }

        const filteredSessions = (sessionsData || []).filter((session: any) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudentId, month])

  const dayInfo = useMemo(() => {
    const info: Record<string, { scheduled: number; cancelled: number }> = {}
    sessions.forEach(session => {
      const date = new Date(session.start_at)
      const key = date.toISOString().slice(0, 10)
      if (!info[key]) info[key] = { scheduled: 0, cancelled: 0 }
      if (session.status === 'scheduled') info[key].scheduled += 1
      else info[key].cancelled += 1
    })
    return info
  }, [sessions])

  const sessionsOfSelected = useMemo(() => {
    return sessions.filter(session => sameYMD(new Date(session.start_at), selected))
  }, [sessions, selected])
  const bookingCutoffByDay = useMemo(() => buildBookingCutoffByDay(sessions), [sessions])

  async function reservar(sessionId: string) {
    if (!activeStudentId) return

    const session = sessions.find((row) => row.session_id === sessionId)
    const bookingDayCutoffAt = session ? bookingCutoffByDay[getBookingDayKey(session.start_at)] : null

    if (hasBookingDayCutoffPassed(bookingDayCutoffAt)) {
      toast.push({
        message: 'Las reservas para este dia se cerraron 2 horas antes del primer turno.',
        type: 'error',
      })
      return
    }

    try {
      setBooking(true)
      const { data, error } = await supabase.rpc('book_session', {
        p_session: sessionId,
        p_student_id: activeStudentId,
      })

      if (error) {
        throw error
      }

      toast.push({ message: 'Reserva creada.', type: 'success' })
      router.push(`/reserva/${data.id}`)
    } catch (bookingError: any) {
      toast.push({ message: bookingError?.message || 'No se pudo reservar.', type: 'error' })
    } finally {
      setBooking(false)
    }
  }

  if (loading || contextLoading) {
    return <div className="p-5">Cargando...</div>
  }

  const monthName = month.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  const isExpired = dashboard?.membership_end ? new Date(dashboard.membership_end) < new Date() : false
  const hasNoClasses = (dashboard?.classes_remaining ?? 0) <= 0
  const cannotBook = isExpired || hasNoClasses || !(bookingProfile?.current_distance_m)

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
    <div className="p-5 space-y-5">
      {account?.role === 'guardian' && activeStudent && students.length > 1 && (
        <div className="card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-textsec">Reservando para</p>
            <p className="font-medium truncate max-w-[150px] sm:max-w-[200px]">{activeStudent.full_name}</p>
          </div>
          <button className="btn-outline text-xs px-3" onClick={() => router.push('/hub')}>
            Cambiar
          </button>
        </div>
      )}

      {cannotBook && (
        <div className="rounded-2xl border border-warning/30 px-5 py-4 bg-warning/10">
          <div className="flex items-start gap-3">
            <span className="text-2xl">!</span>
            <div>
              <p className="font-semibold text-warning">No puedes reservar clases</p>
              <p className="text-sm text-textsec mt-1">
                {isExpired
                  ? 'La membresia del alumno ha vencido. Contacta al administrador para renovarla.'
                  : hasNoClasses
                    ? 'El alumno no tiene clases disponibles. Contacta al administrador para agregar mas clases.'
                    : 'El alumno no tiene distancia configurada. Contacta al administrador para habilitar reservas.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="w-full space-y-4">
        <ClassCardsBoard
          cards={classCards}
          loading={classCardsLoading}
          error={classCardsError}
          canReserve={!cannotBook}
          studentId={activeStudentId}
        />
      </div>

      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Calendario de Turnos</h1>
        <div className="flex gap-2">
          <button
            className="btn-outline min-w-[44px] min-h-[44px] flex items-center justify-center text-lg"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="Mes anterior"
          >
            ←
          </button>
          <button
            className="btn-outline min-w-[44px] min-h-[44px] flex items-center justify-center text-lg"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
      </header>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium capitalize">{monthName}</span>
        </div>

        <div className="grid grid-cols-7 text-center text-xs text-textsec mb-2">
          <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {grid.map((date, index) => {
            const inMonth = date.getMonth() === month.getMonth()
            if (!inMonth) {
              return <div key={index} className="h-12"></div>
            }

            const key = date.toISOString().slice(0, 10)
            const info = dayInfo[key]
            const isToday = sameYMD(date, today)
            const isSelected = sameYMD(date, selected)

            let bg = 'bg-card'
            let ring = ''
            if (info?.cancelled && !info?.scheduled) bg = 'bg-danger/10'
            else if (info?.scheduled) bg = 'bg-accent/5'
            if (isToday) ring = 'ring-2 ring-accent'
            if (isSelected) ring = 'ring-2 ring-accent/60 bg-accent/10'

            return (
              <button
                key={index}
                onClick={() => setSelected(date)}
                className={`h-12 grid place-items-center rounded-xl ${bg} text-textpri ${ring} transition-all`}
              >
                <span className="text-sm font-medium">{date.getDate()}</span>
                {info?.scheduled ? (
                  <span className="block w-1.5 h-1.5 rounded-full bg-accent mt-0.5"></span>
                ) : (
                  <span className="block w-1.5 h-1.5 mt-0.5"></span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <section>
        <h2 className="font-medium mb-2">Horarios disponibles</h2>
        <div className="grid gap-3">
          {sessionsOfSelected.length === 0 && (
            <div className="text-sm text-textsec">No hay turnos para este dia.</div>
          )}

          {sessionsOfSelected.map(session => {
            const start = new Date(session.start_at)
            const end = new Date(session.end_at)
            const spots = session.spots_for_student
            const isPast = start.getTime() <= Date.now()
            const bookingDayCutoffAt = bookingCutoffByDay[getBookingDayKey(session.start_at)]
            const isDayClosed = hasBookingDayCutoffPassed(bookingDayCutoffAt)
            const disabled =
              session.status !== 'scheduled' ||
              session.already_reserved ||
              spots <= 0 ||
              isPast ||
              isDayClosed ||
              cannotBook ||
              booking

            const usageLabel =
              session.bow_usage_type === 'own'
                ? 'Arco propio'
                : session.bow_usage_type === 'assigned'
                  ? 'Arco asignado'
                  : bookingProfile?.bow_poundage
                    ? `Arco academia ${bookingProfile.bow_poundage} lb`
                    : 'Arco academia'

            return (
              <div key={session.session_id} className="card p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className={`text-sm ${spots > 0 ? 'text-success' : 'text-textsec'}`}>
                    {session.status === 'cancelled'
                      ? 'Cancelado'
                      : isPast
                        ? 'Turno iniciado'
                        : isDayClosed
                          ? 'Reservas cerradas para este dia'
                          : session.already_reserved
                            ? 'Ya reservado'
                            : spots > 0
                              ? `${spots} ${spots === 1 ? 'cupo' : 'cupos'} disponibles`
                              : 'Completo'}
                  </p>
                  <p className="text-xs text-textsec mt-1">
                    {session.distance_m} m · {usageLabel}
                    {session.bow_usage_type === 'shared_inventory' && session.bow_capacity !== null && (
                      <> · {Math.max(session.bow_capacity - (session.bow_reserved || 0), 0)} arcos libres</>
                    )}
                  </p>
                </div>
                <button
                  className={`btn ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
                  onClick={() => reservar(session.session_id)}
                  disabled={disabled}
                >
                  {session.already_reserved ? 'Reservado' : booking ? 'Reservando...' : 'Reservar'}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
