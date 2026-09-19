'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import { ArrowLeft, ArrowRight, CalendarClock, MapPin, Target } from 'lucide-react'
import { MobileStudentHeader } from '@/components/student/MobileStudentHeader'
import { StudentCard, StudentNotice } from '@/components/student/StudentCard'
import { StudentPageSkeleton } from '@/components/ui/StudentPageSkeleton'
import { useToast } from '@/components/ui/ToastProvider'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useStudentDashboard } from '@/lib/hooks/useStudentDashboard'
import { supabase } from '@/lib/supabaseClient'

dayjs.locale('es')

type AvailableSession = {
  session_id: string
  start_at: string
  end_at: string
  status: string
  already_reserved: boolean
  distance_m: number
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own'
  spots_for_student: number
  location_code: string
  location_name: string
  location_address: string | null
  booking_mode: string
}

function mondayOf(date: dayjs.Dayjs) {
  const weekday = date.day() || 7
  return date.subtract(weekday - 1, 'day').startOf('day')
}

function equipmentLabel(type: AvailableSession['bow_usage_type']) {
  if (type === 'own') return 'Equipo propio'
  if (type === 'assigned') return 'Arco asignado'
  return 'Arco de academia'
}

export default function ReservarPage() {
  const router = useRouter()
  const toast = useToast()
  const { account, activeStudent, activeStudentId, loading: contextLoading } = useStudentContext()
  const { dashboard } = useStudentDashboard(activeStudentId)
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()))
  const [sessions, setSessions] = useState<AvailableSession[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    if (!activeStudentId) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase.rpc('get_available_multisite_sessions_for_student', {
      p_student_id: activeStudentId,
      p_date_from: weekStart.format('YYYY-MM-DD'),
      p_date_to: weekStart.add(6, 'day').format('YYYY-MM-DD'),
    })
    setLoading(false)
    if (error) {
      toast.push({ message: error.message || 'No se pudo cargar la agenda semanal.', type: 'error' })
      return
    }
    setSessions((data || []) as AvailableSession[])
  }, [activeStudentId, toast, weekStart])

  useEffect(() => {
    if (contextLoading) return
    if (account?.role === 'guardian' && !activeStudentId) {
      router.replace('/hub')
      return
    }
    void loadSessions()
  }, [account?.role, activeStudentId, contextLoading, loadSessions, router])

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => ({
    date: weekStart.add(index, 'day'),
    sessions: sessions.filter((session) => dayjs(session.start_at).isSame(weekStart.add(index, 'day'), 'day')),
  })).filter((day) => day.sessions.length > 0), [sessions, weekStart])

  const cannotBook = dashboard?.membership_status === 'expired'
    || dashboard?.membership_status === 'no_membership'
    || dashboard?.membership_status === 'no_classes'

  const reserve = async (session: AvailableSession) => {
    if (!activeStudentId || savingId) return
    setSavingId(session.session_id)
    const { error } = await supabase.rpc('book_session_multisite', {
      p_session: session.session_id,
      p_student_id: activeStudentId,
    })
    setSavingId(null)
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }
    toast.push({ message: 'Reserva confirmada en Tiabaya.', type: 'success' })
    await loadSessions()
  }

  if (contextLoading || loading) return <StudentPageSkeleton variant="booking" />

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-textpri">
      <MobileStudentHeader title="Reservar clase" subtitle="Agenda flexible de Tiabaya" showBack />
      <main className="space-y-4 px-4 py-5">
        {account?.role === 'guardian' && activeStudent && (
          <StudentCard className="p-4 text-sm">
            Reservando para <strong>{activeStudent.full_name}</strong>
          </StudentCard>
        )}
        {cannotBook && (
          <StudentNotice>La membresía no tiene clases normales ni recuperaciones disponibles para reservar.</StudentNotice>
        )}

        <StudentCard className="overflow-hidden p-0">
          <div className="bg-[#07111d] p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">Tiabaya</p>
            <h1 className="mt-2 text-2xl font-black">Agenda semanal</h1>
            <p className="mt-1 text-sm text-slate-300">
              Elige el turno. El sistema usará el ciclo elegible más antiguo y el crédito correcto.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <button className="btn-outline btn-sm" onClick={() => setWeekStart((date) => date.subtract(7, 'day'))} aria-label="Semana anterior">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <p className="text-center text-sm font-black capitalize">
              {weekStart.format('D MMM')} – {weekStart.add(6, 'day').format('D MMM YYYY')}
            </p>
            <button className="btn-outline btn-sm" onClick={() => setWeekStart((date) => date.add(7, 'day'))} aria-label="Semana siguiente">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </StudentCard>

        {days.length === 0 && (
          <StudentCard className="p-6 text-center text-sm text-textsec">No hay turnos flexibles disponibles esta semana.</StudentCard>
        )}

        {days.map(({ date, sessions: daySessions }) => (
          <section key={date.format('YYYY-MM-DD')} className="space-y-2">
            <h2 className="px-1 text-sm font-black capitalize text-slate-700">{date.format('dddd D [de] MMMM')}</h2>
            {daySessions.map((session) => {
              const soldOut = session.spots_for_student <= 0
              return (
                <StudentCard key={session.session_id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-50 text-accent"><CalendarClock className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-black">{dayjs(session.start_at).format('HH:mm')} – {dayjs(session.end_at).format('HH:mm')}</p>
                      <p className="mt-1 flex items-center gap-1 text-sm text-textsec"><MapPin className="h-4 w-4" /> {session.location_name}{session.location_address ? ` · ${session.location_address}` : ''}</p>
                      <p className="mt-1 flex items-center gap-1 text-sm text-textsec"><Target className="h-4 w-4" /> {session.distance_m} m · {equipmentLabel(session.bow_usage_type)}</p>
                      <p className={`mt-2 text-xs font-bold ${soldOut ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {soldOut ? 'Sin cupos compatibles' : `${session.spots_for_student} cupo${session.spots_for_student === 1 ? '' : 's'} disponible${session.spots_for_student === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  </div>
                  <button type="button" className="btn mt-4 w-full" disabled={cannotBook || soldOut || session.already_reserved || savingId !== null} onClick={() => void reserve(session)}>
                    {session.already_reserved ? 'Ya reservaste este turno' : savingId === session.session_id ? 'Reservando…' : 'Reservar este turno'}
                  </button>
                </StudentCard>
              )
            })}
          </section>
        ))}
      </main>
    </div>
  )
}
