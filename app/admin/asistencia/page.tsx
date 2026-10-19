'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { studentKeys } from '@/lib/queries/studentQueries'
import { membershipRenewalAlertKeys } from '@/lib/hooks/useMembershipRenewalAlerts'
import { operationalDate } from '@/lib/utils/adminCalendar'
import { calendarDayLabel, shiftDate } from '@/lib/utils/introCalendar'

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
  const confirm = useConfirm()
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
  const rosterRequest = useRef(0)
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
    setError(null)

    try {
      for (let offset = 1; offset <= 30; offset += 1) {
        const candidate = shiftDate(selectedDate, offset)
        const { data, error: rpcError } = await supabase.rpc('get_daily_roster', {
          p_date: candidate,
        })

        if (rpcError) throw rpcError
        if (((data || []) as DailyRosterBooking[]).length > 0) {
          selectDate(candidate)
          return
        }
      }

      toast.push({ message: 'No se encontraron reservas en los proximos 30 dias.', type: 'info' })
    } catch (err: any) {
      setError(err.message || 'No se pudieron buscar los proximos turnos.')
    } finally {
      setIsSearchingNext(false)
    }
  }

  const handleMarkAttendance = async (bookingId: string) => {
    if (actionLoading) return
    setActionLoading(bookingId)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_mark_attendance', {
        p_booking_id: bookingId,
        p_attended: true,
      })

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.error || 'Error al marcar asistencia')
      }

      toast.push({ message: 'Asistencia registrada.', type: 'success' })
      await Promise.all([
        loadRoster(selectedDate),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: membershipRenewalAlertKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-operational'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-weekend-intro-capacity'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-students'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['upcoming_bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['intro-calendar'] }),
      ])
    } catch (err: any) {
      console.error('Error marking attendance:', err)
      toast.push({ message: err.message || 'Error al marcar asistencia', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelBooking = async (bookingId: string) => {
    if (actionLoading) return
    const reason = window.prompt('Motivo obligatorio de la cancelación por la academia:')?.trim()
    if (!reason) return
    const ok = await confirm(
      'La reserva se cancelará por la academia. Se liberarán sus recursos y no generará inasistencia. Si ya consumió crédito, se restaurará una sola vez. ¿Continuar?',
      {
        title: 'Cancelar reserva',
        description: 'La cancelación quedará registrada con el motivo indicado.',
        confirmLabel: 'Cancelar reserva',
        tone: 'danger',
      },
    )
    if (!ok) return

    setActionLoading(bookingId)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: bookingId,
        p_reason: reason,
      })

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.error || 'Error al cancelar reserva')
      }

      toast.push({ message: 'Reserva cancelada.', type: 'success' })
      await Promise.all([
        loadRoster(selectedDate),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: membershipRenewalAlertKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard-operational'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-weekend-intro-capacity'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-students'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['upcoming_bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['intro-calendar'] }),
      ])
    } catch (err: any) {
      console.error('Error canceling booking:', err)
      toast.push({ message: err.message || 'Error al cancelar reserva', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Asistencia"
        description="Registra la asistencia. Las reservas sin asistencia se cancelan al finalizar el día sin descontar créditos."
        actions={
          <>
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
              <button type="button" className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-accent" onClick={() => selectDate(operationalDate())}>
                Hoy
              </button>
              <button type="button" className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700" onClick={() => selectDate(shiftDate(operationalDate(), 1))}>
                Mañana
              </button>
              <button
                type="button"
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
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
          title="No hay reservas para este dia."
          description="Puedes revisar manana o saltar al proximo dia con turnos reservados."
          action={
            <button
              type="button"
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-black text-white disabled:opacity-50"
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
          />

          <section className="space-y-3">
            {activeSession.bookings.map((booking) => {
              const isProcessing = actionLoading === booking.booking_id

              return (
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
                  isProcessing={isProcessing || actionLoading !== null}
                  canEdit
                  onAttended={() => handleMarkAttendance(booking.booking_id)}
                  onEdit={() => {
                    if (booking.entry_type === 'intro') {
                      router.push(`/admin/intro?editBookingId=${booking.booking_id}`)
                      return
                    }
                    router.push(`/reserva/${booking.booking_id}/editar`)
                  }}
                  onCancel={() => handleCancelBooking(booking.booking_id)}
                />
              )
            })}
          </section>
        </div>
      )}

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
