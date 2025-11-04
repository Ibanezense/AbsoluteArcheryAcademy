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

      // Cargar las 5 próximas reservas (que no hayan pasado)
      const { data, error } = await supabase
        .from('user_booking_history') // Usamos la vista que tiene el 'full_name'
        .select('id, full_name, start_at, distance_m')
        .eq('status', 'reserved')
        .gte('start_at', dayjs().toISOString()) // Solo desde ahora en adelante
        .order('start_at', { ascending: true })
        .limit(5)

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
