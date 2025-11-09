// Contenido para: components/ui/NextBookingWidget.tsx
'use client'
import { useNextBooking } from '@/lib/hooks/useNextBooking'
import dayjs from 'dayjs'

export function NextBookingWidget() {
  const { booking, isLoading, error } = useNextBooking()

  if (isLoading) {
    return (
      <div className="card w-full max-w-none p-6 rounded-none sm:rounded-xl2 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-white/10 rounded w-2/3"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card w-full max-w-none p-6 rounded-none sm:rounded-xl2 border-danger/30 bg-danger/5">
        <p className="text-danger text-sm">{error}</p>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="card w-full max-w-none p-6 rounded-none sm:rounded-xl2">
        <h3 className="font-semibold text-lg mb-2">Próxima Reserva</h3>
        <p className="text-sm text-textsec">No tienes reservas programadas</p>
      </div>
    )
  }

  const date = dayjs(booking.start_at)
  const isToday = date.isSame(dayjs(), 'day')
  const isTomorrow = date.isSame(dayjs().add(1, 'day'), 'day')
  
  let dateLabel = date.format('dddd, D [de] MMMM')
  if (isToday) dateLabel = 'Hoy'
  if (isTomorrow) dateLabel = 'Mañana'

  return (
    <div className="card w-full max-w-none p-6 rounded-none sm:rounded-xl2 border-accent/30 bg-accent/5">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-lg">Próxima Reserva</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent font-medium">
          {dateLabel}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-textsec">📅 Fecha:</span>
          <span className="font-medium">{date.format('dddd, D [de] MMMM')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-textsec">🕐 Hora:</span>
          <span className="font-medium">{date.format('HH:mm')}</span>
        </div>
        {booking.distance_m && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-textsec">🎯 Distancia:</span>
            <span className="font-medium">{booking.distance_m}m</span>
          </div>
        )}
      </div>
    </div>
  )
}
