import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type MembershipRenewalOption = {
  plan_id: string
  name: string
  classes_included: number
  duration_days: number | null
  regular_price: number
  country_club_price: number | null
  effective_price: number
  currency: string
  is_country_club_member: boolean
}

export type MembershipRenewalRequest = {
  id: string
  student_id: string
  membership_plan_id: string
  classes_included: number
  requested_price: number
  currency: string
  is_country_club_price: boolean
  status: string
  requested_at: string
  student: {
    full_name: string
    avatar_url: string | null
  } | null
  plan: {
    name: string
  } | null
}

export function useMembershipRenewalOptions(studentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['membership-renewal-options', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_membership_renewal_options', {
        p_student_id: studentId,
      })

      if (error) throw error
      return (data || []) as MembershipRenewalOption[]
    },
    enabled: enabled && !!studentId,
  })
}

export function useRequestMembershipRenewal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { studentId: string; planId: string }) => {
      const { data, error } = await supabase.rpc('request_membership_renewal', {
        p_student_id: input.studentId,
        p_membership_plan_id: input.planId,
      })

      if (error) throw error
      if (data && typeof data === 'object' && 'success' in data && !data.success) {
        throw new Error((data as any).error || 'No se pudo registrar la solicitud.')
      }

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['membership-renewal-options', variables.studentId] })
      queryClient.invalidateQueries({ queryKey: ['admin-membership-renewal-requests'] })
    },
  })
}

export function useAdminMembershipRenewalRequests() {
  return useQuery({
    queryKey: ['admin-membership-renewal-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_membership_renewal_requests')
        .select(`
          id,
          student_id,
          membership_plan_id,
          classes_included,
          requested_price,
          currency,
          is_country_club_price,
          status,
          requested_at,
          student:students (
            full_name,
            avatar_url
          ),
          plan:membership_plans (
            name
          )
        `)
        .in('status', ['pending_payment', 'pending_validation'])
        .order('requested_at', { ascending: false })
        .limit(10)

      if (error) throw error

      return ((data || []) as any[]).map((row) => ({
        ...row,
        student: Array.isArray(row.student) ? row.student[0] || null : row.student || null,
        plan: Array.isArray(row.plan) ? row.plan[0] || null : row.plan || null,
      })) as MembershipRenewalRequest[]
    },
  })
}

export function useApproveMembershipRenewalRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { requestId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('admin_approve_membership_renewal_request', {
        p_request_id: input.requestId,
        p_notes: input.notes || null,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-membership-renewal-requests'] })
      queryClient.invalidateQueries({ queryKey: ['membership-plans'] })
      queryClient.invalidateQueries({ queryKey: ['student-detail'] })
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })
}
