// Contenido para: components/ActiveBookingsWidget.tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import dayjs from 'dayjs'

type ActiveBooking = {
  id: string
  full_name: string | null
  start_at: string
  distance_m?: number
}

export function ActiveBookingsWidget() {
  const [bookings, setBookings] = useState<ActiveBooking[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchActiveBookings = async () => {
      setIsLoading(true)

      // Usar RPC function para bypasear RLS
      const { data, error } = await supabase.rpc('get_active_bookings')

      if (error) {
        console.error('Error loading active bookings:', error.message)
      } else {
        setBookings(data as ActiveBooking[])
      }
      setIsLoading(false)
    }
    fetchActiveBookings()
  }, [])

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">
        Próximas Reservas
      </h3>
      <div className="space-y-3">
        {isLoading && (
          <p className="text-textsec text-sm">Cargando reservas...</p>
        )}
        {!isLoading && bookings.length === 0 && (
          <p className="text-textsec text-sm">No hay próximas reservas de estudiantes.</p>
        )}
        {!isLoading && bookings.map((booking) => (
          <div key={booking.id} className="bg-bg p-3 rounded-lg border border-white/10">
            <p className="font-medium text-textpri">{booking.full_name || 'Sin nombre'}</p>
            <p className="text-sm text-textsec">
              {dayjs(booking.start_at).format('ddd, D [de] MMM, hh:mm A')}
              {booking.distance_m && ` · ${booking.distance_m}m`}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
