import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { buildStudentCategory } from '@/lib/utils/studentCategory'

export type StudentListRow = {
  id: string
  full_name: string
  avatar_url: string | null
  date_of_birth: string | null
  dni: string | null
  phone: string | null
  email: string | null
  current_distance_m: number | null
  division: string | null
  gender: string | null
  category: string | null
  level: string | null
  has_own_bow: boolean
  assigned_bow: boolean
  bow_poundage: number | null
  is_active: boolean
  is_country_club_tiabaya_member: boolean
  self_profile_id: string | null
  guardian_name: string | null
  guardian_profile_id: string | null
  guardian_access_code: string | null
  membership_name: string | null
  membership_end: string | null
  membership_status: string | null
  classes_remaining: number
  access_code: string | null
}

export const studentKeys = {
  all: ['students'] as const,
  list: () => [...studentKeys.all, 'list'] as const,
  detail: (id: string) => [...studentKeys.all, 'detail', id] as const,
}

export function mapStudentListRow(student: any): StudentListRow {
  const memberships = [...(student.memberships || [])].sort((left, right) =>
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )
  const today = new Date().toISOString().slice(0, 10)
  const activeMembership =
    memberships.find(
      (membership) =>
        membership.status === 'active' &&
        (!membership.end_date || membership.end_date >= today)
    ) || null
  const latestMembership = memberships[0] || null
  const membershipForDisplay = activeMembership || latestMembership
  const displayStatus =
    membershipForDisplay?.status === 'active' &&
      membershipForDisplay?.end_date &&
      membershipForDisplay.end_date < today
      ? 'expired'
      : membershipForDisplay?.status || null
  const displayClassesRemaining =
    displayStatus === 'active'
      ? membershipForDisplay?.classes_remaining || 0
      : 0
  // PostgREST devuelve objeto (no array) si student_guardians tiene UNIQUE(student_id)
  const guardianRow = Array.isArray(student.guardians)
    ? student.guardians[0] || null
    : student.guardians || null

  return {
    id: student.id,
    full_name: student.full_name,
    avatar_url: student.avatar_url,
    date_of_birth: student.date_of_birth,
    dni: student.dni,
    phone: student.phone,
    email: student.email,
    current_distance_m: student.current_distance_m,
    division: student.division,
    gender: student.gender,
    category: buildStudentCategory({
      dateOfBirth: student.date_of_birth,
      division: student.division,
      gender: student.gender,
      fallbackCategory: student.category,
    }),
    level: student.level,
    has_own_bow: !!student.has_own_bow,
    assigned_bow: !!student.assigned_bow,
    bow_poundage: student.bow_poundage,
    is_active: !!student.is_active,
    is_country_club_tiabaya_member: !!student.is_country_club_tiabaya_member,
    self_profile_id: student.self_profile_id,
    guardian_name: guardianRow?.guardian?.full_name || null,
    guardian_profile_id: guardianRow?.guardian_profile_id || null,
    guardian_access_code: guardianRow?.guardian?.access_code || null,
    membership_name: membershipForDisplay?.custom_name || null,
    membership_end: membershipForDisplay?.end_date || null,
    membership_status: displayStatus,
    classes_remaining: displayClassesRemaining,
    access_code: Array.isArray(student.self_profile)
      ? student.self_profile[0]?.access_code || null
      : student.self_profile?.access_code || null,
  } as StudentListRow
}

export function useStudents() {
  return useQuery({
    queryKey: studentKeys.list(),
    queryFn: async (): Promise<StudentListRow[]> => {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          full_name,
          avatar_url,
          date_of_birth,
          dni,
          phone,
          email,
          current_distance_m,
          division,
          gender,
          category,
          level,
          has_own_bow,
          assigned_bow,
          bow_poundage,
          is_active,
          is_country_club_tiabaya_member,
          self_profile_id,
          self_profile:profiles!students_self_profile_id_fkey (
            access_code
          ),
          guardians:student_guardians (
            relationship,
            guardian_profile_id,
            guardian:profiles!student_guardians_guardian_profile_id_fkey (
              full_name,
              access_code
            )
          ),
          memberships:student_memberships (
            custom_name,
            classes_remaining,
            end_date,
            status,
            created_at
          )
        `)
        .order('full_name', { ascending: true })

      if (error) throw error

      return ((data || []) as any[]).map(mapStudentListRow)
    },
  })
}

export function useToggleStudentActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('students')
        .update({ is_active: isActive })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.all })
    },
  })
}
