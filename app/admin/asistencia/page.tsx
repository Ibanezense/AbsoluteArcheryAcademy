'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import Avatar from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface DailyRosterBooking {
  booking_id: string
  session_id: string
  session_start_at: string
  student_name: string
  student_avatar_url: string | null
  booking_status: 'reserved' | 'confirmed' | 'attended' | 'no_show'
}

interface GroupedSession {
  session_id: string
  session_start_at: string
  bookings: DailyRosterBooking[]
}

export default function AsistenciaPage() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<DailyRosterBooking[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Cargar roster del día
  const loadRoster = async (date: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('get_daily_roster', {
        p_date: date,
      })

      if (rpcError) throw rpcError

      setBookings(data || [])
    } catch (err: any) {
      console.error('Error loading roster:', err)
      setError(err.message || 'Error al cargar el roster')
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar roster cuando cambia la fecha
  useEffect(() => {
    loadRoster(selectedDate)
  }, [selectedDate])

  // Handler: Marcar asistencia (asistió o no asistió)
  const handleMarkAttendance = async (bookingId: string, attended: boolean) => {
    setActionLoading(bookingId)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_mark_attendance', {
        p_booking_id: bookingId,
        p_attended: attended,
      })

      if (rpcError) throw rpcError

      if (!data.success) {
        throw new Error(data.error || 'Error al marcar asistencia')
      }

      // Refrescar datos
      await loadRoster(selectedDate)
    } catch (err: any) {
      console.error('Error marking attendance:', err)
      alert(err.message || 'Error al marcar asistencia')
    } finally {
      setActionLoading(null)
    }
  }

  // Handler: Cancelar reserva
  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('¿Estás seguro de cancelar esta reserva? Se devolverá la clase al alumno.')) {
      return
    }

    setActionLoading(bookingId)

    try {
      const { data, error: rpcError } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: bookingId,
      })

      if (rpcError) throw rpcError

      if (!data.success) {
        throw new Error(data.error || 'Error al cancelar reserva')
      }

      // Refrescar datos
      await loadRoster(selectedDate)
    } catch (err: any) {
      console.error('Error canceling booking:', err)
      alert(err.message || 'Error al cancelar reserva')
    } finally {
      setActionLoading(null)
    }
  }

  // Agrupar bookings por turno (session)
  const groupedSessions: GroupedSession[] = bookings.reduce((acc, booking) => {
    const existing = acc.find((g) => g.session_id === booking.session_id)
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

  // Formatear hora del turno
  const formatSessionTime = (timestamp: string) => {
    return dayjs(timestamp).format('HH:mm')
  }

  // Formatear fecha para mostrar
  const formatDateLabel = (date: string) => {
    return dayjs(date).format('dddd, D [de] MMMM [de] YYYY')
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <button className="btn-ghost !px-3" onClick={() => router.push('/admin')}>
              ←
            </button>
            <h1 className="text-lg font-semibold">Gestión de Asistencia</h1>
          </div>
        </div>

        {/* Selector de fecha */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Seleccionar Día</h2>
              <p className="text-sm text-textsec capitalize">{formatDateLabel(selectedDate)}</p>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 rounded-xl border border-white/10 bg-card text-textpri"
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Spinner />
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="card p-6 border-danger/30 bg-danger/5">
            <p className="text-danger text-center">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && bookings.length === 0 && (
          <div className="card p-12 text-center">
            <p className="text-textsec text-lg">No hay reservas para este día</p>
          </div>
        )}

        {/* Roster agrupado por turno */}
        {!isLoading && !error && groupedSessions.length > 0 && (
          <div className="space-y-6">
            {groupedSessions.map((session) => (
              <div key={session.session_id} className="card p-6">
                {/* Header del turno */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
                  <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <span className="text-accent font-bold text-lg">
                      {formatSessionTime(session.session_start_at)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Turno de {formatSessionTime(session.session_start_at)}
                    </h3>
                    <p className="text-sm text-textsec">
                      {session.bookings.length} alumno{session.bookings.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Lista de alumnos */}
                <div className="space-y-3">
                  {session.bookings.map((booking) => {
                    const isProcessing = actionLoading === booking.booking_id
                    const isAttended = booking.booking_status === 'attended'
                    const isNoShow = booking.booking_status === 'no_show'
                    const isConfirmed = booking.booking_status === 'reserved'

                    return (
                      <div
                        key={booking.booking_id}
                        className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition"
                      >
                        {/* Avatar y nombre */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar
                            url={booking.student_avatar_url}
                            name={booking.student_name}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{booking.student_name}</p>
                            <p className="text-xs text-textsec">
                              {isAttended && '✓ Asistió'}
                              {isNoShow && '✗ No asistió'}
                              {isConfirmed && 'Confirmado'}
                            </p>
                          </div>
                        </div>

                        {/* Botones de acción */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {/* Botón: Asistió */}
                          <button
                            onClick={() => handleMarkAttendance(booking.booking_id, true)}
                            disabled={isProcessing || isAttended || isNoShow}
                            className="btn-outline text-sm px-3 py-2 flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? '...' : '✓ Asistió'}
                          </button>

                          {/* Botón: No Asistió */}
                          <button
                            onClick={() => handleMarkAttendance(booking.booking_id, false)}
                            disabled={isProcessing || isAttended || isNoShow}
                            className="btn-outline text-sm px-3 py-2 flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? '...' : '✗ No asistió'}
                          </button>

                          {/* Botón: Cancelar */}
                          <button
                            onClick={() => handleCancelBooking(booking.booking_id)}
                            disabled={isProcessing || !isConfirmed}
                            className="btn-ghost text-sm px-3 py-2 text-danger hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              !isConfirmed
                                ? 'Solo se pueden cancelar reservas confirmadas'
                                : 'Cancelar reserva'
                            }
                          >
                            {isProcessing ? '...' : 'Cancelar'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminGuard>
  )
}
