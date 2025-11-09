// Contenido para: lib/hooks/useBookingHistory.ts
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type BookingHistoryItem = {
  booking_id: string
  start_at: string
  status: string
}

const PAGE_SIZE = 10 // Cargaremos de 10 en 10

export function useBookingHistory() {
  const [bookings, setBookings] = useState<BookingHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true) // Para saber si hay más páginas

  const loadMoreBookings = useCallback(async () => {
    // No cargar más si ya no hay o si ya está cargando
    if (!hasMore || isLoading) return

    setIsLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_booking_history_paginated', {
        page_number: page,
        page_size: PAGE_SIZE
      })
      if (rpcError) throw rpcError
      if (data && data.length > 0) {
        // Añadir los nuevos resultados a la lista existente
        setBookings(prev => [...prev, ...data])
        setPage(prev => prev + 1) // Preparar para la siguiente página
        // Si devuelve menos de PAGE_SIZE, es la última página
        if (data.length < PAGE_SIZE) {
          setHasMore(false)
        }
      } else {
        // No hay más datos
        setHasMore(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el historial')
    } finally {
      setIsLoading(false)
    }
  }, [page, hasMore, isLoading]) // Depende de estos estados

  // Devolvemos los datos y la función para cargar más
  return {
    bookings,
    isLoading,
    error,
    hasMore,
    loadMoreBookings // La página llamará a esto para cargar la siguiente página
  }
}
