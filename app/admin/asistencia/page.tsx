'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import AdminGuard from '@/components/AdminGuard'
import Avatar from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'

interface DailyRosterBooking {
  booking_id: string
  session_id: string
  session_start_at: string
  student_id: string
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
  if (booking.bow_usage_type === 'own') return 'Arco propio'
  if (booking.bow_usage_type === 'assigned') return 'Arco asignado'
  if (booking.bow_usage_type === 'shared_inventory' && booking.bow_poundage) {
    return `Arco academia ${booking.bow_poundage} lb`
  }
  if (booking.bow_usage_type === 'shared_inventory') return 'Arco academia'
  return 'Equipo sin definir'
}

export default function AsistenciaPage() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<DailyRosterBooking[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadRoster = async (date: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('get_daily_roster', {
        p_date: date,
      })

      if (rpcError) throw rpcError
      setBookings(((data || []) as DailyRosterBooking[]))
    } catch (err: any) {
      console.error('Error loading roster:', err)
      setError(err.message || 'Error al cargar el roster')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRoster(selectedDate)
  }, [selectedDate])

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

      await loadRoster(selectedDate)
    } catch (err: any) {
      console.error('Error marking attendance:', err)
      alert(err.message || 'Error al marcar asistencia')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Se cancelara esta reserva y se devolvera la clase al alumno. Continuar?')) {
      return
    }

    setActionLoading(bookingId)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: bookingId,
        p_refund: true,
      })

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.error || 'Error al cancelar reserva')
      }

      await loadRoster(selectedDate)
    } catch (err: any) {
      console.error('Error canceling booking:', err)
      alert(err.message || 'Error al cancelar reserva')
    } finally {
      setActionLoading(null)
    }
  }

  const groupedSessions: GroupedSession[] = useMemo(() => {
    return bookings.reduce((acc, booking) => {
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
  }, [bookings])

  const formatSessionTime = (timestamp: string) => dayjs(timestamp).format('HH:mm')
  const formatDateLabel = (date: string) => dayjs(date).format('dddd, D [de] MMMM [de] YYYY')

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="sticky top-0 z-10 border-b border-white/10 bg-bg/95 px-4 py-3 backdrop-blur lg:px-8 lg:-mx-8 -mx-4">
          <div className="flex items-center gap-3">
            <button className="btn-ghost !px-3" onClick={() => router.push('/admin')}>
              Volver
            </button>
            <div>
              <h1 className="text-lg font-semibold text-textpri">Gestion de asistencia</h1>
              <p className="text-sm text-textsec">Marca asistencia y resuelve cancelaciones del dia.</p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-textpri">Seleccionar dia</h2>
              <p className="mt-1 text-sm capitalize text-textsec">{formatDateLabel(selectedDate)}</p>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="input w-full sm:w-auto"
            />
          </div>
        </section>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        )}

        {error && !isLoading && (
          <div className="card border-danger/30 bg-danger/5 p-6">
            <p className="text-center text-danger">{error}</p>
          </div>
        )}

        {!isLoading && !error && bookings.length === 0 && (
          <div className="card p-12 text-center">
            <p className="text-lg text-textsec">No hay reservas para este dia.</p>
          </div>
        )}

        {!isLoading && !error && groupedSessions.length > 0 && (
          <div className="space-y-6">
            {groupedSessions.map((session) => (
              <section key={session.session_id} className="card p-6">
                <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                    <span className="text-lg font-bold text-accent">
                      {formatSessionTime(session.session_start_at)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-textpri">
                      Turno de {formatSessionTime(session.session_start_at)}
                    </h3>
                    <p className="text-sm text-textsec">
                      {session.bookings.length} alumno{session.bookings.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {session.bookings.map((booking) => {
                    const isProcessing = actionLoading === booking.booking_id
                    const isAttended = booking.booking_status === 'attended'
                    const isNoShow = booking.booking_status === 'no_show'
                    const isReserved = booking.booking_status === 'reserved'

                    return (
                      <div
                        key={booking.booking_id}
                        className="flex flex-col gap-4 rounded-2xl bg-white/5 p-4 transition hover:bg-white/10 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar
                            url={booking.student_avatar_url}
                            name={booking.student_name}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-textpri">{booking.student_name}</p>
                            <p className="text-xs text-textsec">
                              {booking.distance_m ? `${booking.distance_m} m` : 'Sin distancia'} · {bowUsageLabel(booking)}
                            </p>
                            {booking.admin_notes && (
                              <p className="text-xs italic text-warning">Nota: {booking.admin_notes}</p>
                            )}
                            <p className={`text-xs ${isAttended ? 'text-success font-semibold' :
                              isNoShow ? 'text-danger' :
                                'text-textsec'
                              }`}>
                              {isAttended && 'Asistio'}
                              {isNoShow && 'No asistio'}
                              {isReserved && 'Reservado'}
                            </p>
                          </div>
                        </div>

                        <div className="flex w-full items-center gap-2 sm:w-auto">
                          <button
                            onClick={() => handleMarkAttendance(booking.booking_id, true)}
                            disabled={isProcessing || isAttended || isNoShow}
                            className="btn-outline flex-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                          >
                            {isProcessing ? '...' : 'Asistio'}
                          </button>

                          <button
                            onClick={() => handleMarkAttendance(booking.booking_id, false)}
                            disabled={isProcessing || isAttended || isNoShow}
                            className="btn-outline flex-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                          >
                            {isProcessing ? '...' : 'No asistio'}
                          </button>

                          <button
                            onClick={() => router.push(`/reserva/${booking.booking_id}/editar`)}
                            disabled={isProcessing || !isReserved}
                            className="btn-ghost px-3 py-2 text-sm text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                            title={!isReserved ? 'Solo se pueden editar reservas pendientes' : 'Cambiar turno'}
                          >
                            {isProcessing ? '...' : 'Editar'}
                          </button>

                          <button
                            onClick={() => handleCancelBooking(booking.booking_id)}
                            disabled={isProcessing || !isReserved}
                            className="btn-ghost px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                            title={!isReserved ? 'Solo se pueden cancelar reservas pendientes' : 'Cancelar reserva'}
                          >
                            {isProcessing ? '...' : 'Cancelar'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AdminGuard>
  )
}
