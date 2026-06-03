import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { studentKeys } from '@/lib/queries/studentQueries'
import { buildStudentCategory } from '@/lib/utils/studentCategory'

export type StudentAccountSummary = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  dni: string | null
  access_code: string | null
  is_active: boolean
  role: 'admin' | 'guardian' | 'student' | null
}

export type StudentMembershipSummary = {
  id: string
  membership_plan_id: string | null
  custom_name: string
  classes_total: number
  classes_used: number
  classes_remaining: number
  start_date: string
  end_date: string | null
  status: string
  total_amount: number
  currency: string
  notes: string | null
  created_at: string
}

export type StudentPaymentSummary = {
  id: string
  student_membership_id: string
  due_date: string | null
  paid_at: string
  amount: number
  currency: string
  payment_method: string | null
  payment_status: string
  reward_credits: number
  reward_reason: string | null
  notes: string | null
}

export type StudentLedgerSummary = {
  id: string
  booking_id: string | null
  student_membership_id: string | null
  movement_type: string
  delta: number
  balance_after: number | null
  reason: string
  created_at: string
}

export type StudentBookingSummary = {
  id: string
  session_id: string
  status: string
  distance_m: number | null
  bow_usage_type: string | null
  bow_poundage: number | null
  admin_notes: string | null
  start_at: string | null
  end_at: string | null
}

export type StudentDetailData = {
  id: string
  full_name: string
  avatar_url: string | null
  date_of_birth: string | null
  dni: string | null
  phone: string | null
  email: string | null
  medical_notes: string | null
  current_distance_m: number | null
  division: string | null
  gender: string | null
  category: string | null
  level: string | null
  has_own_bow: boolean
  assigned_bow: boolean
  bow_poundage: number | null
  is_active: boolean
  operational_status: string | null
  operational_status_reason: string | null
  operational_status_updated_at: string | null
  is_country_club_tiabaya_member: boolean
  created_at: string
  updated_at: string
  self_account: StudentAccountSummary | null
  guardian: (StudentAccountSummary & {
    relationship: string | null
    guardian_profile_id: string
  }) | null
  active_membership: StudentMembershipSummary | null
  memberships: StudentMembershipSummary[]
  payments: StudentPaymentSummary[]
  ledger: StudentLedgerSummary[]
  bookings: StudentBookingSummary[]
}

function sortMemberships(memberships: StudentMembershipSummary[]) {
  const rank: Record<string, number> = {
    active: 0,
    draft: 1,
    expired: 2,
    consumed: 3,
    historical: 4,
    cancelled: 5,
  }

  return [...memberships].sort((left, right) => {
    const leftRank = rank[left.status] ?? 99
    const rightRank = rank[right.status] ?? 99

    if (leftRank !== rightRank) return leftRank - rightRank

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
}

export function useStudentDetail(studentId: string) {
  return useQuery({
    queryKey: studentKeys.detail(studentId),
    enabled: !!studentId,
    queryFn: async (): Promise<StudentDetailData> => {
      const [{ data: studentRow, error: studentError }, { data: payments, error: paymentsError }, { data: ledger, error: ledgerError }, { data: bookings, error: bookingsError }] =
        await Promise.all([
          supabase
            .from('students')
            .select(`
              id,
              full_name,
              avatar_url,
              date_of_birth,
              dni,
              phone,
              email,
              medical_notes,
              current_distance_m,
              division,
              gender,
              category,
              level,
              has_own_bow,
              assigned_bow,
              bow_poundage,
              is_active,
              operational_status,
              operational_status_reason,
              operational_status_updated_at,
              is_country_club_tiabaya_member,
              created_at,
              updated_at,
              self_profile_id,
              self_profile:profiles!students_self_profile_id_fkey (
                id,
                full_name,
                email,
                phone,
                dni,
                access_code,
                is_active,
                role
              ),
              guardians:student_guardians (
                relationship,
                guardian_profile_id,
                guardian:profiles!student_guardians_guardian_profile_id_fkey (
                  id,
                  full_name,
                  email,
                  phone,
                  dni,
                  access_code,
                  is_active,
                  role
                )
              ),
              memberships:student_memberships (
                id,
                membership_plan_id,
                custom_name,
                classes_total,
                classes_used,
                classes_remaining,
                start_date,
                end_date,
                status,
                total_amount,
                currency,
                notes,
                created_at
              )
            `)
            .eq('id', studentId)
            .maybeSingle(),
          supabase
            .from('student_membership_payments')
            .select('id,student_membership_id,due_date,paid_at,amount,currency,payment_method,payment_status,reward_credits,reward_reason,notes')
            .eq('student_id', studentId)
            .order('paid_at', { ascending: false })
            .limit(10),
          supabase
            .from('student_credit_ledger')
            .select('id,booking_id,student_membership_id,movement_type,delta,balance_after,reason,created_at')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('bookings')
            .select('id,session_id,status,distance_m,bow_usage_type,bow_poundage,admin_notes,sessions(start_at,end_at)')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .limit(12),
        ])

      if (studentError) throw studentError
      if (paymentsError) throw paymentsError
      if (ledgerError) throw ledgerError
      if (bookingsError) throw bookingsError
      if (!studentRow) throw new Error('Alumno no encontrado')

      const typedStudent = studentRow as any
      const memberships = sortMemberships((typedStudent.memberships || []) as StudentMembershipSummary[])
      const activeMembership = memberships.find((membership) => membership.status === 'active') || null

      // PostgREST devuelve objeto (no array) si student_guardians tiene UNIQUE(student_id)
      const guardianRow = Array.isArray(typedStudent.guardians)
        ? typedStudent.guardians[0] || null
        : typedStudent.guardians || null
      const guardianProfile = guardianRow?.guardian || null
      const selfProfile = Array.isArray(typedStudent.self_profile)
        ? typedStudent.self_profile[0] || null
        : typedStudent.self_profile || null

      return {
        id: typedStudent.id,
        full_name: typedStudent.full_name,
        avatar_url: typedStudent.avatar_url,
        date_of_birth: typedStudent.date_of_birth,
        dni: typedStudent.dni,
        phone: typedStudent.phone,
        email: typedStudent.email,
        medical_notes: typedStudent.medical_notes,
        current_distance_m: typedStudent.current_distance_m,
        division: typedStudent.division,
        gender: typedStudent.gender,
        category: buildStudentCategory({
          dateOfBirth: typedStudent.date_of_birth,
          division: typedStudent.division,
          gender: typedStudent.gender,
          fallbackCategory: typedStudent.category,
        }),
        level: typedStudent.level,
        has_own_bow: !!typedStudent.has_own_bow,
        assigned_bow: !!typedStudent.assigned_bow,
        bow_poundage: typedStudent.bow_poundage,
        is_active: !!typedStudent.is_active,
        operational_status: typedStudent.operational_status || null,
        operational_status_reason: typedStudent.operational_status_reason || null,
        operational_status_updated_at: typedStudent.operational_status_updated_at || null,
        is_country_club_tiabaya_member: !!typedStudent.is_country_club_tiabaya_member,
        created_at: typedStudent.created_at,
        updated_at: typedStudent.updated_at,
        self_account: selfProfile
          ? {
            id: selfProfile.id,
            full_name: selfProfile.full_name,
            email: selfProfile.email,
            phone: selfProfile.phone,
            dni: selfProfile.dni,
            access_code: selfProfile.access_code,
            is_active: !!selfProfile.is_active,
            role: selfProfile.role,
          }
          : null,
        guardian: guardianProfile
          ? {
            id: guardianProfile.id,
            guardian_profile_id: guardianRow.guardian_profile_id,
            relationship: guardianRow.relationship,
            full_name: guardianProfile.full_name,
            email: guardianProfile.email,
            phone: guardianProfile.phone,
            dni: guardianProfile.dni,
            access_code: guardianProfile.access_code,
            is_active: !!guardianProfile.is_active,
            role: guardianProfile.role,
          }
          : null,
        active_membership: activeMembership,
        memberships,
        payments: ((payments || []) as StudentPaymentSummary[]).map((payment) => ({
          ...payment,
          reward_credits: payment.reward_credits || 0,
        })),
        ledger: (ledger || []) as StudentLedgerSummary[],
        bookings: ((bookings || []) as any[]).map((booking) => ({
          id: booking.id,
          session_id: booking.session_id,
          status: booking.status,
          distance_m: booking.distance_m,
          bow_usage_type: booking.bow_usage_type,
          bow_poundage: booking.bow_poundage,
          admin_notes: booking.admin_notes,
          start_at: booking.sessions?.start_at || null,
          end_at: booking.sessions?.end_at || null,
        })),
      }
    },
  })
}
