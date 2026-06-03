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
  membership_plan_id: string | null
  custom_name: string
  status: string
  classes_total: number
  classes_used: number
  classes_remaining: number
  start_date: string
  end_date: string | null
  total_amount: number
  currency: string
  notes: string | null
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
  allMemberships: () => [...membershipPlanKeys.all, 'all-memberships'] as const,
  recentMemberships: () => [...membershipPlanKeys.all, 'recent-memberships'] as const,
}

const studentMembershipSelect = `
  id,
  membership_plan_id,
  custom_name,
  status,
  classes_total,
  classes_used,
  classes_remaining,
  start_date,
  end_date,
  total_amount,
  currency,
  notes,
  created_at,
  student:students (
    id,
    full_name,
    avatar_url
  )
`

function mapAdminStudentMembership(row: any): AdminStudentMembership {
  return {
    id: row.id,
    membership_plan_id: row.membership_plan_id,
    custom_name: row.custom_name,
    status: row.status,
    classes_total: row.classes_total,
    classes_used: row.classes_used,
    classes_remaining: row.classes_remaining,
    start_date: row.start_date,
    end_date: row.end_date,
    total_amount: row.total_amount,
    currency: row.currency,
    notes: row.notes,
    created_at: row.created_at,
    student: Array.isArray(row.student) ? row.student[0] || null : row.student || null,
  }
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
        .select(studentMembershipSelect)
        .order('created_at', { ascending: false })
        .limit(12)

      if (error) throw error

      return ((data || []) as any[]).map(mapAdminStudentMembership)
    },
  })
}

export function useAdminStudentMemberships() {
  return useQuery({
    queryKey: membershipPlanKeys.allMemberships(),
    queryFn: async (): Promise<AdminStudentMembership[]> => {
      const { data, error } = await supabase
        .from('student_memberships')
        .select(studentMembershipSelect)
        .order('created_at', { ascending: false })

      if (error) throw error

      return ((data || []) as any[]).map(mapAdminStudentMembership)
    },
  })
}
