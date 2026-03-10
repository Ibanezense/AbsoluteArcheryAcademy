import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export type MembershipPlan = {
  id: string
  name: string
  description: string | null
  classes_included: number
  duration_days: number | null
  base_price: number | null
  currency: string
  is_active: boolean
  created_at: string
}

export type AdminStudentMembership = {
  id: string
  custom_name: string
  status: string
  classes_total: number
  classes_remaining: number
  start_date: string
  end_date: string | null
  total_amount: number
  currency: string
  created_at: string
  student: {
    id: string
    full_name: string
    avatar_url: string | null
  } | null
}

export const membershipPlanKeys = {
  all: ['membership-plans'] as const,
  list: () => [...membershipPlanKeys.all, 'list'] as const,
  recentMemberships: () => [...membershipPlanKeys.all, 'recent-memberships'] as const,
}

export function useMembershipPlans() {
  return useQuery({
    queryKey: membershipPlanKeys.list(),
    queryFn: async (): Promise<MembershipPlan[]> => {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as MembershipPlan[]
    },
  })
}

export function useRecentStudentMemberships() {
  return useQuery({
    queryKey: membershipPlanKeys.recentMemberships(),
    queryFn: async (): Promise<AdminStudentMembership[]> => {
      const { data, error } = await supabase
        .from('student_memberships')
        .select(`
          id,
          custom_name,
          status,
          classes_total,
          classes_remaining,
          start_date,
          end_date,
          total_amount,
          currency,
          created_at,
          student:students (
            id,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(12)

      if (error) throw error

      return ((data || []) as any[]).map((row) => ({
        id: row.id,
        custom_name: row.custom_name,
        status: row.status,
        classes_total: row.classes_total,
        classes_remaining: row.classes_remaining,
        start_date: row.start_date,
        end_date: row.end_date,
        total_amount: row.total_amount,
        currency: row.currency,
        created_at: row.created_at,
        student: Array.isArray(row.student) ? row.student[0] || null : row.student || null,
      }))
    },
  })
}
