'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { fetchStudentMembershipBalance, fetchStudentMembershipCoverageEnd, fetchStudentNextMembership } from '@/lib/services/studentMembershipCoverage'
import { limaBookingDate } from '@/lib/utils/studentBooking'

export type StudentDashboard = {
  student_id: string
  full_name: string
  avatar_url: string | null
  date_of_birth: string | null
  age: number | null
  current_distance_m: number | null
  category: string | null
  level: string | null
  student_is_active: boolean
  membership_name: string | null
  membership_start: string | null
  membership_end: string | null
  membership_status: string | null
  classes_total: number | null
  classes_used: number | null
  classes_remaining: number | null
}

export function useStudentDashboard(studentId: string | null) {
  const { data: dashboard = null, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['student-dashboard', studentId],
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('get_student_dashboard', {
        p_student_id: studentId!,
      })

      if (rpcError) throw rpcError

      return (data?.[0] || null) as StudentDashboard | null
    },
    enabled: !!studentId,
  })

  const error = queryError ? (queryError as Error).message : null

  return { dashboard, loading, error }
}

export function useStudentMembershipCoverageEnd(studentId: string | null) {
  return useQuery({
    queryKey: ['student-dashboard', studentId, 'membership-coverage-end'],
    queryFn: () => fetchStudentMembershipCoverageEnd(studentId!),
    enabled: !!studentId,
  })
}

export function useStudentNextMembership(studentId: string | null) {
  const today = limaBookingDate().format('YYYY-MM-DD')
  return useQuery({
    queryKey: ['student-dashboard', studentId, 'next-membership', today],
    queryFn: () => fetchStudentNextMembership(studentId!, today),
    enabled: !!studentId,
  })
}

export function useStudentMembershipBalance(studentId: string | null) {
  const today = limaBookingDate().format('YYYY-MM-DD')
  return useQuery({
    queryKey: ['student-dashboard', studentId, 'membership-balance', today],
    queryFn: () => fetchStudentMembershipBalance(studentId!, today),
    enabled: !!studentId,
  })
}
