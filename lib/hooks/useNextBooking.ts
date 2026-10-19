import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type NextBooking = {
  booking_id?: string
  start_at: string
  end_at?: string
  status?: string
  distance_m: number | null
}

export function useNextBooking(studentId?: string | null) {
  const query = useQuery({
    queryKey: ['student-next-booking', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_next_booking', { p_student_id: studentId })
      if (error) throw error
      return data as NextBooking | null
    },
  })
  return {
    booking: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? (query.error.message || 'Error al cargar') : null,
    refetch: query.refetch,
  }
}
