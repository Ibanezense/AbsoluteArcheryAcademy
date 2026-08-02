import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { buildStudentCategory } from '@/lib/utils/studentCategory'
import { summarizeMemberships } from '@/lib/utils/membershipCycles'

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
  operational_status: string | null
  effective_operational_status: string
  is_country_club_tiabaya_member: boolean
  self_profile_id: string | null
  guardian_name: string | null
  guardian_profile_id: string | null
  guardian_access_code: string | null
  created_at: string
  last_attendance_at: string | null
  membership_name: string | null
  membership_end: string | null
  membership_expired_at: string | null
  membership_status: string | null
  membership_raw_classes_remaining: number
  classes_remaining: number
  total_open_classes: number
  open_membership_count: number
  access_code: string | null
}

export const studentKeys = {
  all: ['students'] as const,
  list: () => [...studentKeys.all, 'list'] as const,
  detail: (id: string) => [...studentKeys.all, 'detail', id] as const,
}

const PROTECTED_OPERATIONAL_STATUSES = new Set(['retired', 'withdrawn', 'blocked', 'suspended'])

type AttendedBookingRow = {
  student_id: string | null
  attendance_marked_at: string | null
  sessions: { start_at: string | null } | Array<{ start_at: string | null }> | null
}

export function buildLastAttendanceByStudent(rows: AttendedBookingRow[]) {
  const latestByStudent = new Map<string, string>()

  for (const row of rows) {
    if (!row.student_id) continue

    const session = Array.isArray(row.sessions) ? row.sessions[0] || null : row.sessions
    const attendanceAt = session?.start_at || row.attendance_marked_at
    if (!attendanceAt) continue

    const current = latestByStudent.get(row.student_id)
    if (!current || new Date(attendanceAt).getTime() > new Date(current).getTime()) {
      latestByStudent.set(row.student_id, attendanceAt)
    }
  }

  return latestByStudent
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function dateKey(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function daysSinceExpiration(expiredAt: string | null | undefined, endDate: string | null | undefined) {
  const basis = expiredAt
    ? new Date(expiredAt)
    : endDate
      ? addDays(new Date(`${endDate}T00:00:00.000Z`), 1)
      : null

  if (!basis || Number.isNaN(basis.getTime())) return 0

  const today = new Date(`${todayKey()}T00:00:00.000Z`)
  const basisDay = new Date(basis.toISOString().slice(0, 10) + 'T00:00:00.000Z')
  return Math.floor((today.getTime() - basisDay.getTime()) / 86400000)
}

export function mapStudentListRow(student: any): StudentListRow {
  const today = todayKey()
  const memberships = [...(student.memberships || [])].sort((left, right) =>
    new Date(right.expired_at || right.end_date || right.start_date || right.created_at).getTime() -
    new Date(left.expired_at || left.end_date || left.start_date || left.created_at).getTime()
  )
  const summarizableMemberships = memberships.map((membership, index) => {
    const startDate = membership.start_date || dateKey(membership.created_at) || today
    return {
      ...membership,
      id: membership.id || `legacy-membership-${index}`,
      start_date: startDate,
      status: membership.status === 'draft' ? 'historical' as const : membership.status,
      classes_remaining: membership.classes_remaining ?? 0,
      created_at: membership.created_at || `${startDate}T00:00:00.000Z`,
    }
  })
  const membershipSummary = summarizeMemberships(summarizableMemberships, today)
  const activeMembership = memberships.find(
    (_membership, index) => summarizableMemberships[index].id === membershipSummary.currentMembershipId,
  ) || null
  const latestMembership = memberships[0] || null
  const membershipForDisplay = activeMembership || latestMembership
  const displayMembershipIndex = membershipForDisplay
    ? memberships.indexOf(membershipForDisplay)
    : -1
  const summarizedDisplayStatus = displayMembershipIndex >= 0
    ? membershipSummary.statusesById[summarizableMemberships[displayMembershipIndex].id]
    : null
  const displayStatus = activeMembership
    ? 'active'
    : summarizedDisplayStatus === 'consumed'
      ? 'expired'
      : summarizedDisplayStatus || membershipForDisplay?.status || null
  const displayClassesRemaining = activeMembership?.classes_remaining || 0
  const persistedOperationalStatus = student.operational_status || null
  const effectiveOperationalStatus = (() => {
    if (persistedOperationalStatus && PROTECTED_OPERATIONAL_STATUSES.has(persistedOperationalStatus)) {
      return persistedOperationalStatus
    }

    if (activeMembership) return 'active'

    if (persistedOperationalStatus === 'paused') return 'paused'
    if (persistedOperationalStatus === 'expired') return 'expired'

    if (latestMembership) {
      const latestStatus = displayStatus || latestMembership.status
      if (latestStatus === 'expired') {
        return daysSinceExpiration(latestMembership.expired_at, latestMembership.end_date) >= 14 ? 'paused' : 'expired'
      }
    }

    return student.is_active ? 'active' : 'paused'
  })()
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
    operational_status: persistedOperationalStatus,
    effective_operational_status: effectiveOperationalStatus,
    is_country_club_tiabaya_member: !!student.is_country_club_tiabaya_member,
    self_profile_id: student.self_profile_id,
    guardian_name: guardianRow?.guardian?.full_name || null,
    guardian_profile_id: guardianRow?.guardian_profile_id || null,
    guardian_access_code: guardianRow?.guardian?.access_code || null,
    created_at: student.created_at,
    last_attendance_at: student.last_attendance_at || null,
    membership_name: membershipForDisplay?.custom_name || null,
    membership_end: membershipForDisplay?.end_date || null,
    membership_expired_at: membershipForDisplay?.expired_at || null,
    membership_status: displayStatus,
    membership_raw_classes_remaining: membershipForDisplay?.classes_remaining ?? 0,
    classes_remaining: displayClassesRemaining,
    total_open_classes: membershipSummary.totalOpenClasses,
    open_membership_count: membershipSummary.openCount,
    access_code: Array.isArray(student.self_profile)
      ? student.self_profile[0]?.access_code || null
      : student.self_profile?.access_code || null,
  } as StudentListRow
}

export function useStudents() {
  return useQuery({
    queryKey: studentKeys.list(),
    queryFn: async (): Promise<StudentListRow[]> => {
      const [studentsResult, attendanceResult] = await Promise.all([
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
            is_country_club_tiabaya_member,
            created_at,
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
              id,
              custom_name,
              classes_total,
              classes_remaining,
              start_date,
              end_date,
              expired_at,
              status,
              created_at,
              membership_origin,
              assignment_batch_id
            )
          `)
          .order('full_name', { ascending: true }),
        supabase
          .from('bookings')
          .select('student_id,attendance_marked_at,sessions(start_at)')
          .eq('status', 'attended')
          .not('student_id', 'is', null),
      ])

      if (studentsResult.error) throw studentsResult.error
      if (attendanceResult.error) throw attendanceResult.error

      const lastAttendanceByStudent = buildLastAttendanceByStudent(
        (attendanceResult.data || []) as AttendedBookingRow[],
      )

      return ((studentsResult.data || []) as any[]).map((student) =>
        mapStudentListRow({
          ...student,
          last_attendance_at: lastAttendanceByStudent.get(student.id) || null,
        }),
      )
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
