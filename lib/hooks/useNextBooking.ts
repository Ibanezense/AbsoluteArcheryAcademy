import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type NextBooking = {
  booking_id?: string
  start_at: string
  end_at?: string
  status?: string
  distance_m: number | null
}

export function useNextBooking(studentId?: string | null) {
  const [booking, setBooking] = useState<NextBooking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNextBooking = useCallback(async () => {
    if (!studentId) {
      setBooking(null)
      setError(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_my_next_booking', {
        p_student_id: studentId,
      })

      if (rpcError) throw rpcError
      setBooking(data as NextBooking | null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar')
    } finally {
      setIsLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    fetchNextBooking()
  }, [fetchNextBooking])

  return { booking, isLoading, error, refetch: fetchNextBooking }
}
