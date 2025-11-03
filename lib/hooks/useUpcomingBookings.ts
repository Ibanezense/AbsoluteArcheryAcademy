import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from './useProfile'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export type UpcomingBooking = {
  booking_id: string
  start_at: string
  end_at: string
  distance_m: number | null
  status: string
}

export function useUpcomingBookings(profile: Profile | null) {
  const [bookings, setBookings] = useState<UpcomingBooking[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Solo ejecutar si tenemos un perfil válido
    if (!profile) {
      setBookings([])
      return
    }

    const fetchUpcomingBookings = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const { data: rows, error: bookingsError } = await supabase
          .from('user_booking_history')
          .select('*')

        if (bookingsError) {
          throw new Error(bookingsError.message)
        }

        const now = dayjs()
        const upcomingBookings = (rows || [])
          .map((r: any) => ({ ...r, start_at: r.start_at }))
          .filter((r: any) => 
            r.start_at && 
            dayjs(r.start_at).isAfter(now) && 
            r.status === 'reserved'
          )
          .sort((a: any, b: any) => 
            dayjs(a.start_at).valueOf() - dayjs(b.start_at).valueOf()
          )

        setBookings(upcomingBookings as UpcomingBooking[])
      } catch (err) {
        console.error('Error al cargar próximas reservas:', err)
        setError(err instanceof Error ? err : new Error('Error desconocido'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchUpcomingBookings()
  }, [profile])

  return { bookings, isLoading, error }
}
