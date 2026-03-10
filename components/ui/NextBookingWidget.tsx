'use client'

import { useNextBooking } from '@/lib/hooks/useNextBooking'
import dayjs from 'dayjs'

export function NextBookingWidget({ studentId }: { studentId?: string | null }) {
  const { booking, isLoading, error } = useNextBooking(studentId)

  if (isLoading) {
    return (
      <div className="w-full p-5 animate-pulse bg-card">
        <div className="h-6 bg-line rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-line rounded w-2/3"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-5 border-l-4 border-danger bg-danger/5">
        <p className="text-danger text-sm font-medium">{error}</p>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="w-full p-5 bg-card flex flex-col items-center justify-center text-center py-8">
        <h3 className="font-semibold text-lg mb-1">Sin reservas</h3>
        <p className="text-sm text-textsec">No hay reservas programadas próximamente</p>
      </div>
    )
  }

  const date = dayjs(booking.start_at)
  const isToday = date.isSame(dayjs(), 'day')
  const isTomorrow = date.isSame(dayjs().add(1, 'day'), 'day')

  let dateLabel = date.format('dddd, D [de] MMMM')
  if (isToday) dateLabel = 'Hoy'
  if (isTomorrow) dateLabel = 'Manana'

  return (
    <div className="w-full p-5 bg-gradient-to-br from-card to-accent/5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
            <span className="font-semibold text-sm">{date.format('D')}</span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-textpri leading-tight">Proxima Reserva</h3>
            <span className="text-xs text-textsec capitalize">{date.format('dddd, MMMM YYYY')}</span>
          </div>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full bg-accent text-white font-medium uppercase tracking-wider">
          {dateLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-line/60">
        <div>
          <span className="text-xs text-textsec block mb-0.5">Hora:</span>
          <span className="font-medium text-sm">{date.format('HH:mm')}</span>
        </div>
        {booking.distance_m && (
          <div>
            <span className="text-xs text-textsec block mb-0.5">Distancia:</span>
            <span className="font-medium text-sm">{booking.distance_m}m</span>
          </div>
        )}
      </div>
    </div>
  )
}
