import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type BookingHistoryItem = {
  booking_id: string
  start_at: string
  status: string
  distance_m: number | null
  bow_usage_type: string | null
}

const PAGE_SIZE = 10

export function useBookingHistory(studentId?: string | null) {
  const [bookings, setBookings] = useState<BookingHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    setBookings([])
    setPage(1)
    setHasMore(true)
    setError(null)
  }, [studentId])

  const loadMoreBookings = useCallback(async () => {
    if (!studentId || !hasMore || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_booking_history_paginated', {
        page_number: page,
        page_size: PAGE_SIZE,
        p_student_id: studentId,
      })

      if (rpcError) throw rpcError

      if (data && data.length > 0) {
        setBookings(prev => [...prev, ...data])
        setPage(prev => prev + 1)

        if (data.length < PAGE_SIZE) {
          setHasMore(false)
        }
      } else {
        setHasMore(false)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar el historial')
    } finally {
      setIsLoading(false)
    }
  }, [studentId, page, hasMore, isLoading])

  return {
    bookings,
    isLoading,
    error,
    hasMore,
    loadMoreBookings,
  }
}
