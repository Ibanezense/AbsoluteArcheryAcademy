'use client'
import { useQuery } from '@tanstack/react-query'
import { fetchStudentBookingHistory, type HistoryOptions } from '@/lib/services/studentBookingHistoryService'

export function useStudentBookingHistory(studentId: string | null | undefined, options: HistoryOptions = {}) {
  return useQuery({
    queryKey: ['student-booking-history', studentId, options.scope || 'history', options.month || '', options.status || 'all', options.page || 1],
    queryFn: () => fetchStudentBookingHistory(studentId!, options),
    enabled: !!studentId,
  })
}
