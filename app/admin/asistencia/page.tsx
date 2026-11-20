'use client'

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  AttendanceBackToSessionsLink,
  AttendanceSessionTabs,
  AttendanceStudentRow,
  AttendanceSummaryCard,
  EmptyOperationalState,
} from '@/components/admin/AdminOperationalComponents'
import { AdminPageHeader } from '@/components/admin/AdminVisualSystem'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { studentKeys } from '@/lib/queries/studentQueries'
import { membershipRenewalAlertKeys } from '@/lib/hooks/useMembershipRenewalAlerts'
import { operationalDate } from '@/lib/utils/adminCalendar'
import { calendarDate, calendarDayLabel, calendarTime, shiftDate } from '@/lib/utils/introCalendar'

interface DailyRosterBooking {
  booking_id: string
  session_id: string
  session_start_at: string
  entry_type: 'student' | 'intro'
  student_id: string | null
  intro_client_id: string | null
  student_name: string
  student_avatar_url: string | null
  booking_status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  admin_notes: string | null
  distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null
  bow_poundage: number | null
}

interface GroupedSession {
  session_id: string
  session_start_at: string
  location_name: string
  bookings: DailyRosterBooking[]
}

function bowUsageLabel(booking: DailyRosterBooking) {
  if (booking.entry_type === 'intro') return 'Clase de prueba'
  if (booking.bow_usage_type === 'own') return 'Arco propio'
  if (booking.bow_usage_type === 'assigned') return 'Arco asignado'
  if (booking.bow_usage_type === 'shared_inventory' && booking.bow_poundage) {
    return `Arco academia ${booking.bow_poundage} lb`
  }
  if (booking.bow_usage_type === 'shared_inventory') return 'Arco academia'
  return 'Equipo sin definir'
}

function formatDateLabel(date: string) {
  return calendarDayLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function AsistenciaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const queryClient = useQueryClient()

  const requestedDate = searchParams.get('date')
  const requestedSessionId = searchParams.get('sessionId')
  const [selectedDate, setSelectedDate] = useState(() => operationalDate(requestedDate))
  const [activeSessionId, setActiveSessionId] = useState<string | null>(requestedSessionId)
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchingNext, setIsSearchingNext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<DailyRosterBooking[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const actionLock = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  const [cancellation, setCancellation] = useState<DailyRosterBooking | null>(null)
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const rosterRequest = useRef(0)
  const currentDate = useRef(selectedDate)
  const [sessionLocations, setSessionLocations] = useState<Record<string, string>>({})

  useEffect(() => {
    if (requestedDate) setSelectedDate(operationalDate(requestedDate))
  }, [requestedDate])

  const selectDate = (date: string) => {
    if (operationalDate(date) !== date) return
    setSelectedDate(date)
    setActiveSessionId(null)
    router.replace(`/admin/asistencia?date=${date}`, { scroll: false })
  }

  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId)
    router.replace(`/admin/asistencia?date=${selectedDate}&sessionId=${encodeURIComponent(sessionId)}`, { scroll: false })
  }

  const loadRoster = async (date: string) => {
    const request = ++rosterRequest.current
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('get_daily_roster', {
        p_date: date,
      })

      if (rpcError) throw rpcError
      const rows = (data || []) as DailyRosterBooking[]
      const sessionIds = Array.from(new Set(rows.map((row) => row.session_id)))
      const locations: Record<string, string> = {}
      if (sessionIds.length) {
        const result = await supabase.from('sessions')
          .select('id,location:academy_locations!sessions_location_id_fkey(name)').in('id', sessionIds)
        if (result.error) throw result.error
        for (const session of result.data || []) {
          const location = Array.isArray(session.location) ? session.location[0] : session.location
          locations[session.id] = location?.name || 'Sede no disponible'
        }
      }
      if (request !== rosterRequest.current) return []
      setSessionLocations(locations)
      setBookings(rows)
      return rows
    } catch (err: any) {
      if (request !== rosterRequest.current) return []
      console.error('Error loading roster:', err)
      setError(err.message || 'Error al cargar el roster')
      return []
    } finally {
      if (request === rosterRequest.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    currentDate.current = selectedDate
    void loadRoster(selectedDate)
  }, [selectedDate])

  const groupedSessions: GroupedSession[] = useMemo(() => {
    const grouped = bookings.reduce((acc, booking) => {
      const existing = acc.find((group) => group.session_id === booking.session_id)
      if (existing) {
        existing.bookings.push(booking)
      } else {
        acc.push({
          session_id: booking.session_id,
          session_start_at: booking.session_start_at,
          location_name: sessionLocations[booking.session_id] || 'Sede no disponible',
          bookings: [booking],
        })
      }
      return acc
    }, [] as GroupedSession[])

    grouped.sort((left, right) => dayjs(left.session_start_at).valueOf() - dayjs(right.session_start_at).valueOf())
    return grouped
  }, [bookings, sessionLocations])

  useEffect(() => {
    if (!groupedSessions.length) {
      setActiveSessionId(null)
      return
    }

    setActiveSessionId((current) => {
      const requestedExists = requestedSessionId && groupedSessions.some((session) => session.session_id === requestedSessionId)
      if (requestedExists) return requestedSessionId
      const currentExists = current && groupedSessions.some((session) => session.session_id === current)
      if (currentExists) return current
      return groupedSessions[0].session_id
    })
  }, [groupedSessions, requestedSessionId])

  const activeSession = useMemo(() => {
    return groupedSessions.find((session) => session.session_id === activeSessionId) || groupedSessions[0] || null
  }, [activeSessionId, groupedSessions])
  const activeStart = activeSession ? Date.parse(activeSession.session_start_at) : 0
  const sessionHasStarted = Boolean(activeSession && activeStart <= now)

  useEffect(() => {
    if (!activeStart) return
    let timer: number | undefined
    const updateClock = () => {
      const current = Date.now()
      setNow(current)
      if (current < activeStart) timer = window.setTimeout(updateClock, Math.min(activeStart - current, 60_000))
    }
    updateClock()
    return () => window.clearTimeout(timer)
  }, [activeStart])

  const activeStats = useMemo(() => {
    const rows = activeSession?.bookings || []
    return {
      total: rows.length,
      attended: rows.filter((booking) => booking.booking_status === 'attended').length,
      noShow: rows.filter((booking) => booking.booking_status === 'no_show').length,
      cancelled: rows.filter((booking) => booking.booking_status === 'cancelled').length,
    }
  }, [activeSession])

  const findNextRosterDate = async () => {
    setIsSearchingNext(true)
    try {
      const { data, error: queryError } = await supabase.from('sessions').select('start_at,bookings!inner(id)')
        .gte('start_at', `${shiftDate(selectedDate, 1)}T00:00:00-05:00`)
        .lt('start_at', `${shiftDate(selectedDate, 31)}T00:00:00-05:00`)
        .in('bookings.status', ['reserved', 'attended', 'no_show'])
        .order('start_at').limit(1).limit(1, { referencedTable: 'bookings' }).maybeSingle()
      if (queryError) throw queryError
      if (currentDate.current !== selectedDate) return
      if (data?.start_at) selectDate(calendarDate(data.start_at))
      else toast.push({ message: 'No se encontraron reservas en los próximos 30 días.', type: 'info' })
    } catch (err: any) {
      toast.push({ message: err.message || 'No se pudieron buscar los próximos turnos.', type: 'error' })
    } finally {
      setIsSearchingNext(false)
    }
  }

  const refreshAfterChange = () => Promise.all([
    loadRoster(currentDate.current),
    ...[
      studentKeys.all, membershipRenewalAlertKeys.all, ['admin-dashboard-operational'], ['admin-weekend-intro-capacity'],
      ['admin-bookings'], ['admin-students'], ['sessions'], ['upcoming_bookings'], ['intro-calendar'],
    ].map(queryKey => queryClient.invalidateQueries({ queryKey })),
  ])

  const handleMarkAttendance = async (booking: DailyRosterBooking) => {
    if (actionLock.current || booking.booking_status !== 'reserved') return
    if (!(Date.parse(booking.session_start_at) <= Date.now())) {
      toast.push({ message: 'Podrás marcar la asistencia cuando empiece el turno.', type: 'info' })
      return
    }
    actionLock.current = true
    setActionLoading(booking.booking_id)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_mark_attendance', {
        p_booking_id: booking.booking_id,
        p_attended: true,
      })

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.error || 'Error al marcar asistencia')
      }

      if (data.new_status === 'no_show') toast.push({ message: 'La reserva ya figura como no asistida. Revisa el historial para corregirla.', type: 'info' })
      else toast.push({ message: 'Asistencia registrada.', type: 'success' })
      await refreshAfterChange()
    } catch (err: any) {
      console.error('Error marking attendance:', err)
      toast.push({ message: err.message || 'Error al marcar asistencia', type: 'error' })
    } finally {
      actionLock.current = false
      setActionLoading(null)
    }
  }

  const handleCancelBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cancellation || !reason.trim() || actionLock.current) return
    actionLock.current = true
    setActionLoading(cancellation.booking_id)
    setCancelError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: cancellation.booking_id,
        p_reason: reason.trim(),
      })

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.error || 'Error al cancelar reserva')
      }

      toast.push({ message: 'Reserva cancelada.', type: 'success' })
      setCancellation(null)
      await refreshAfterChange()
    } catch (err: any) {
      console.error('Error canceling booking:', err)
      setCancelError(err.message || 'No se pudo cancelar la reserva.')
    } finally {
      actionLock.current = false
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Asistencia"
        description="Registra la asistencia desde el inicio del turno. Las reservas de alumnos pendientes se cierran al finalizar el día según la regla de su membresía."
        actions={
          <>
            <Link href="/admin/asistencia/lista-ingreso" className="btn-outline btn-sm">Lista de ingreso</Link>
            <AttendanceBackToSessionsLink href={`/admin/sesiones?date=${selectedDate}`} />
          </>
        }
      />

      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.055)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-black tracking-[-0.045em] text-slate-950">Seleccionar día</h2>
            <p className="mt-1 text-sm capitalize text-slate-500">{formatDateLabel(selectedDate)}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-[#084681]" onClick={() => selectDate(operationalDate())}>
                Hoy
              </button>
              <button type="button" className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-[#084681]" onClick={() => selectDate(shiftDate(operationalDate(), 1))}>
                Mañana
              </button>
              <button
                type="button"
                className="rounded-2xl bg-[#0758aa] px-4 py-3 text-sm font-black text-white hover:bg-[#084681] disabled:opacity-50"
                disabled={isSearchingNext}
                onClick={findNextRosterDate}
              >
                {isSearchingNext ? 'Buscando' : 'Próximos turnos'}
              </button>
            </div>
            <input
              type="date"
              aria-label="Fecha de asistencia"
              value={selectedDate}
              onChange={(event) => selectDate(event.target.value)}
              className="input w-full sm:w-auto"
            />
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="flex items-center justify-center rounded-[1.6rem] border border-slate-200 bg-white py-12">
          <Spinner />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-[1.6rem] border border-rose-200 bg-rose-50 p-6">
          <p className="text-center font-bold text-rose-700">{error}</p>
          <button type="button" className="mt-3 min-h-11 underline" onClick={() => loadRoster(selectedDate)}>Reintentar</button>
        </div>
      )}

      {!isLoading && !error && bookings.length === 0 && (
        <EmptyOperationalState
          title="No hay reservas para este día."
          description="Puedes revisar mañana o saltar al próximo día con reservas."
          action={
            <button
              type="button"
              className="rounded-2xl bg-[#0758aa] px-5 py-3 text-sm font-black text-white hover:bg-[#084681] disabled:opacity-50"
              disabled={isSearchingNext}
              onClick={findNextRosterDate}
            >
              Ver Próximos turnos
            </button>
          }
        />
      )}

      {!isLoading && !error && activeSession && (
        <div className="space-y-5">
          <AttendanceSessionTabs
            sessions={groupedSessions}
            activeSessionId={activeSession.session_id}
            onSelect={selectSession}
          />

          <AttendanceSummaryCard
            startAt={activeSession.session_start_at}
            locationName={activeSession.location_name}
            total={activeStats.total}
            attended={activeStats.attended}
            noShow={activeStats.noShow}
            cancelled={activeStats.cancelled}
            sessionHasStarted={sessionHasStarted}
          />

          <section className="space-y-3">
            {activeSession.bookings.map((booking) => (
                <AttendanceStudentRow
                  key={booking.booking_id}
                  entryType={booking.entry_type}
                  name={booking.student_name}
                  avatarUrl={booking.student_avatar_url}
                  distanceM={booking.distance_m}
                  equipmentLabel={bowUsageLabel(booking)}
                  participantLabel={booking.entry_type === 'intro' ? 'Clase de prueba' : null}
                  status={booking.booking_status}
                  notes={booking.admin_notes}
                  isProcessing={actionLoading !== null}
                  isMarking={actionLoading === booking.booking_id && !cancellation}
                  canMarkAttendance={sessionHasStarted}
                  historyLink={booking.student_id && booking.booking_status !== 'reserved'
                    ? <Link href={`/admin/alumnos/${booking.student_id}?tab=attendance`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#084681] underline">Ver historial</Link>
                    : undefined}
                  canEdit
                  onAttended={() => handleMarkAttendance(booking)}
                  onEdit={() => {
                    if (booking.entry_type === 'intro') {
                      router.push(`/admin/intro?editBookingId=${booking.booking_id}`)
                      return
                    }
                    router.push(`/reserva/${booking.booking_id}/editar`)
                  }}
                  onCancel={() => { setReason(''); setCancelError(null); setCancellation(booking) }}
                />
            ))}
          </section>
        </div>
      )}

      {cancellation && <Modal isOpen title={cancellation.booking_status === 'reserved' ? 'Cancelar reserva por la academia' : 'Corregir registro y cancelar reserva'}
        onClose={() => { if (!actionLock.current) setCancellation(null) }}>
        <form onSubmit={handleCancelBooking} className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-slate-800">
            <p className="font-bold">{cancellation.student_name}</p>
            <p className="mt-1 capitalize">{formatDateLabel(calendarDate(cancellation.session_start_at))} · {calendarTime(cancellation.session_start_at)} · {sessionLocations[cancellation.session_id]}</p>
            <p className="mt-2">{cancellation.entry_type === 'intro'
              ? 'La cita se cancelará y se liberará su cupo.'
              : cancellation.booking_status === 'reserved'
                ? 'Se liberará el cupo. La cancelación no generará una inasistencia ni consumirá una clase.'
                : 'La reserva quedará cancelada. Si consumió un crédito por esta asistencia, se devolverá una sola vez.'}</p>
          </div>
          <label className="block text-sm font-semibold">Motivo obligatorio
            <textarea className="input mt-1 min-h-24 w-full" required value={reason} disabled={actionLoading !== null} onChange={event => setReason(event.target.value)} />
          </label>
          {cancelError && <p role="alert" className="text-sm font-semibold text-rose-700">{cancelError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-outline min-h-11" disabled={actionLoading !== null} onClick={() => setCancellation(null)}>Volver</button>
            <button type="submit" className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50" disabled={actionLoading !== null || !reason.trim()}>
              {actionLoading ? 'Cancelando…' : 'Confirmar cancelación'}
            </button>
          </div>
        </form>
      </Modal>}
    </div>
  )
}

export default function AsistenciaPage() {
  return (
    <Suspense fallback={<div className="p-6"><Spinner /></div>}>
      <AsistenciaContent />
    </Suspense>
  )
}
