// Contenido para: lib/hooks/useNextBooking.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type NextBooking = {
  start_at: string
  distance_m: number | null
}

export function useNextBooking() {
  const [booking, setBooking] = useState<NextBooking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNextBooking = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_my_next_booking')
      if (rpcError) throw rpcError
      setBooking(data as NextBooking | null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNextBooking()
  }, [fetchNextBooking])

  return { booking, isLoading, error, refetch: fetchNextBooking }
}
