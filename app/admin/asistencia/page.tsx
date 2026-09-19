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
import WeeklyAttendanceReview from '@/components/admin/WeeklyAttendanceReview'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { studentKeys } from '@/lib/queries/studentQueries'
import { membershipRenewalAlertKeys } from '@/lib/hooks/useMembershipRenewalAlerts'
import { membershipPlanKeys } from '@/lib/hooks/useMembershipPlans'
import {
  getWeeklyAttendanceReview,
  markWeeklyNoShow,
  resolveStudentCancellation,
  type WeeklyAttendanceCandidate,
  type WeeklyAttendanceReview as WeeklyAttendanceReviewData,
} from '@/lib/services/adminWeeklyAttendanceService'
import { getWeeklyAttendanceWindow } from '@/lib/utils/weeklyAttendance'

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
  return dayjs(date).format('dddd, D [de] MMMM [de] YYYY')
}

function AsistenciaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const confirm = useConfirm()
  const toast = useToast()
  const queryClient = useQueryClient()

  const requestedDate = searchParams.get('date')
  const requestedSessionId = searchParams.get('sessionId')
  const [selectedDate, setSelectedDate] = useState(() => requestedDate || dayjs().format('YYYY-MM-DD'))
  const [activeSessionId, setActiveSessionId] = useState<string | null>(requestedSessionId)
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchingNext, setIsSearchingNext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<DailyRosterBooking[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [weeklyReview, setWeeklyReview] = useState<WeeklyAttendanceReviewData | null>(null)
  const [weeklyReviewLoading, setWeeklyReviewLoading] = useState(false)
  const [weeklyReviewError, setWeeklyReviewError] = useState<string | null>(null)
  const [weeklyActionLoading, setWeeklyActionLoading] = useState<string | null>(null)
  const weeklyActionsInFlight = useRef(new Set<string>())
  const weeklyWindow = useMemo(() => getWeeklyAttendanceWindow(selectedDate), [selectedDate])
  const canReviewWeeklyAttendance = weeklyWindow.isSunday && !dayjs(selectedDate).isAfter(dayjs(), 'day')

  useEffect(() => {
    if (requestedDate && requestedDate !== selectedDate) {
      setSelectedDate(requestedDate)
    }
  }, [requestedDate, selectedDate])

  const loadRoster = async (date: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('get_daily_roster', {
        p_date: date,
      })

      if (rpcError) throw rpcError
      const rows = (data || []) as DailyRosterBooking[]
      setBookings(rows)
      return rows
    } catch (err: any) {
      console.error('Error loading roster:', err)
      setError(err.message || 'Error al cargar el roster')
      return []
    } finally {
      setIsLoading(false)
    }
  }

  const loadWeeklyReview = async (date: string) => {
    if (!getWeeklyAttendanceWindow(date).isSunday || dayjs(date).isAfter(dayjs(), 'day')) {
      setWeeklyReview(null)
      setWeeklyReviewError(null)
      setWeeklyReviewLoading(false)
      return
    }

    setWeeklyReviewLoading(true)
    setWeeklyReviewError(null)

    try {
      const review = await getWeeklyAttendanceReview(supabase, date)
      setWeeklyReview(review)
    } catch (err: any) {
      console.error('Error loading weekly attendance review:', err)
      setWeeklyReview(null)
      setWeeklyReviewError(err.message || 'No se pudo cargar la revisión semanal.')
    } finally {
      setWeeklyReviewLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadRoster(selectedDate), loadWeeklyReview(selectedDate)])
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
          bookings: [booking],
        })
      }
      return acc
    }, [] as GroupedSession[])

    grouped.sort((left, right) => dayjs(left.session_start_at).valueOf() - dayjs(right.session_start_at).valueOf())
    return grouped
  }, [bookings])

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

  const setQuickDate = (date: dayjs.Dayjs) => {
    setSelectedDate(date.format('YYYY-MM-DD'))
  }

  const findNextRosterDate = async () => {
    setIsSearchingNext(true)
    setError(null)

    try {
      for (let offset = 1; offset <= 30; offset += 1) {
        const candidate = dayjs().add(offset, 'day').format('YYYY-MM-DD')
        const { data, error: rpcError } = await supabase.rpc('get_daily_roster', {
          p_date: candidate,
        })

        if (rpcError) throw rpcError
        if (((data || []) as DailyRosterBooking[]).length > 0) {
          setSelectedDate(candidate)
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

  const handleMarkAttendance = async (bookingId: string, attended: boolean) => {
    setActionLoading(bookingId)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_mark_attendance', {
        p_booking_id: bookingId,
        p_attended: attended,
      })

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.error || 'Error al marcar asistencia')
      }

      toast.push({ message: attended ? 'Asistencia registrada.' : 'No-show registrado.', type: 'success' })
      await Promise.all([
        loadRoster(selectedDate),
        loadWeeklyReview(selectedDate),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: membershipRenewalAlertKeys.all }),
      ])
    } catch (err: any) {
      console.error('Error marking attendance:', err)
      toast.push({ message: err.message || 'Error al marcar asistencia', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelBooking = async (bookingId: string) => {
    const reason = window.prompt('Motivo obligatorio de la cancelación por la academia:')?.trim()
    if (!reason) return
    const ok = await confirm(
      'La reserva se cancelará por la academia. Se liberarán sus recursos y no generará inasistencia. Si ya consumió crédito, se restaurará una sola vez. ¿Continuar?',
      {
        title: 'Cancelar reserva',
        description: 'Esta accion usa la RPC admin actual y requiere confirmacion porque cambia el estado de la reserva.',
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
        loadWeeklyReview(selectedDate),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: membershipRenewalAlertKeys.all }),
      ])
    } catch (err: any) {
      console.error('Error canceling booking:', err)
      toast.push({ message: err.message || 'Error al cancelar reserva', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkWeeklyNoShow = async (candidate: WeeklyAttendanceCandidate) => {
    if (
      weeklyActionsInFlight.current.size > 0
      || weeklyActionsInFlight.current.has(candidate.student_id)
    ) return
    weeklyActionsInFlight.current.add(candidate.student_id)

    try {
      const pendingLabel = candidate.missing_count === 1
        ? '1 clase pendiente'
        : `${candidate.missing_count} clases pendientes`
      const remainingAfterMark = Math.max(candidate.missing_count - 1, 0)
      const remainingLabel = remainingAfterMark === 0
        ? 'Con este registro completará su control semanal.'
        : `Después quedarán ${remainingAfterMark} ${remainingAfterMark === 1 ? 'clase pendiente' : 'clases pendientes'}.`
      const ok = await confirm(
        `${candidate.student_name} tiene ${pendingLabel}. Se descontará una clase y se guardará una inasistencia en su historial. ${remainingLabel} ¿Continuar?`,
        {
          title: 'Confirmar 1 inasistencia',
          description: 'Este registro se usa para controlar la participación en el campeonato nacional.',
          confirmLabel: 'Marcar 1 inasistencia',
          tone: 'danger',
        },
      )
      if (!ok) return

      const requestId = crypto.randomUUID()
      setWeeklyActionLoading(candidate.student_id)

      const result = await markWeeklyNoShow(supabase, {
        studentId: candidate.student_id,
        sunday: selectedDate,
        requestId,
      })

      toast.push({
        message: result.already_marked
          ? 'La inasistencia semanal ya estaba registrada.'
          : result.remaining_missing_count > 0
            ? `Inasistencia registrada. Quedan ${result.remaining_missing_count} ${result.remaining_missing_count === 1 ? 'clase pendiente' : 'clases pendientes'}.`
            : 'Inasistencia registrada. El control semanal quedó completo.',
        type: 'success',
      })
      await Promise.all([
        loadRoster(selectedDate),
        loadWeeklyReview(selectedDate),
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: membershipPlanKeys.all }),
        queryClient.invalidateQueries({ queryKey: membershipRenewalAlertKeys.all }),
      ])
    } catch (err: any) {
      console.error('Error marking weekly no-show:', err)
      toast.push({ message: err.message || 'No se pudo registrar la inasistencia semanal.', type: 'error' })
      await loadWeeklyReview(selectedDate)
    } finally {
      setWeeklyActionLoading(null)
      weeklyActionsInFlight.current.delete(candidate.student_id)
    }
  }

  const handleResolveCancellation = async (candidate: WeeklyAttendanceCandidate, resolution: 'justified' | 'no_show') => {
    if (!candidate.cancellation_id || weeklyActionLoading) return
    let adminReason: string | undefined
    if (resolution === 'justified') {
      adminReason = window.prompt('Motivo administrativo obligatorio de la cancelación justificada:')?.trim()
      if (!adminReason) return
    }
    const confirmed = await confirm(
      resolution === 'no_show'
        ? `Se descontará una clase a ${candidate.student_name} y quedará registrada como inasistencia.`
        : `La cancelación de ${candidate.student_name} quedará justificada. Si no existe otra oportunidad válida esta semana, se ampliará la membresía 7 días.`,
      { title: resolution === 'no_show' ? 'Confirmar inasistencia' : 'Confirmar justificación', confirmLabel: 'Confirmar', tone: resolution === 'no_show' ? 'danger' : 'warning' },
    )
    if (!confirmed) return
    setWeeklyActionLoading(candidate.student_id)
    try {
      const result = await resolveStudentCancellation(supabase, {
        cancellationId: candidate.cancellation_id,
        resolution,
        adminReason,
      })
      toast.push({
        message: result.extension_applied
          ? 'Cancelación justificada y membresía ampliada 7 días.'
          : resolution === 'no_show' ? 'Inasistencia registrada.' : 'Cancelación justificada.',
        type: 'success',
      })
      await loadWeeklyReview(selectedDate)
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo resolver la cancelación.', type: 'error' })
    } finally {
      setWeeklyActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Asistencia"
        description="Marca asistencia o no-show con foco en el turno activo del dia."
        actions={
          <>
            <AttendanceBackToSessionsLink href={`/admin/sesiones?date=${selectedDate}`} />
            <button className="btn-ghost !px-3" onClick={() => router.push('/admin')}>
              Volver
            </button>
          </>
        }
      />

      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.055)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-black tracking-[-0.045em] text-slate-950">Seleccionar dia</h2>
            <p className="mt-1 text-sm capitalize text-slate-500">{formatDateLabel(selectedDate)}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-accent" onClick={() => setQuickDate(dayjs())}>
                Hoy
              </button>
              <button type="button" className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700" onClick={() => setQuickDate(dayjs().add(1, 'day'))}>
                Manana
              </button>
              <button
                type="button"
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                disabled={isSearchingNext}
                onClick={findNextRosterDate}
              >
                {isSearchingNext ? 'Buscando' : 'Proximos turnos'}
              </button>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
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
              Ver Proximos turnos
            </button>
          }
        />
      )}

      {!isLoading && !error && activeSession && (
        <div className="space-y-5">
          <AttendanceSessionTabs
            sessions={groupedSessions}
            activeSessionId={activeSession.session_id}
            onSelect={setActiveSessionId}
          />

          <AttendanceSummaryCard
            startAt={activeSession.session_start_at}
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
                  isProcessing={isProcessing}
                  canEdit
                  onAttended={() => handleMarkAttendance(booking.booking_id, true)}
                  onNoShow={() => handleMarkAttendance(booking.booking_id, false)}
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

      {canReviewWeeklyAttendance && (
        <WeeklyAttendanceReview
          review={weeklyReview}
          isLoading={weeklyReviewLoading}
          error={weeklyReviewError}
          processingStudentId={weeklyActionLoading}
          onMark={handleMarkWeeklyNoShow}
          onResolveCancellation={handleResolveCancellation}
        />
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
