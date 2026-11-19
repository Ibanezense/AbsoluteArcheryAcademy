import { supabase } from '@/lib/supabaseClient'

export type StudentBookingSession = {
  session_id: string; start_at: string; end_at: string; status: string
  already_reserved: boolean; distance_m: number | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own'
  spots_for_student: number; location_code: string; location_name: string
  location_address: string | null; booking_mode: string
  can_book: boolean; eligibility_reason: string; eligibility_message: string | null
  credit_kind: 'normal' | 'recovery' | null; eligible_membership_id: string | null
}

export type StudentBookingDetail = {
  booking_id: string; student_id: string; student_name: string
  status: 'reserved' | 'cancelled' | 'attended' | 'no_show'
  start_at: string; end_at: string; distance_m: number | null; group_type: string | null
  bow_usage_type: 'shared_inventory' | 'assigned' | 'own' | null; bow_poundage: number | null
  location_name: string | null; location_address: string | null; booking_mode: string | null
  cancellation_source: string | null; cancellation_resolution: string | null
  cancellation_review_status: string | null
}

export async function fetchStudentBookingAgenda(studentId: string, fromDate: string, toDate: string): Promise<StudentBookingSession[]> {
  const { data, error } = await supabase.rpc('get_student_booking_agenda', { p_student_id: studentId, p_date_from: fromDate, p_date_to: toDate })
  if (error) throw error
  return data || []
}

type StudentBookingResult = { sessionId: string } & (
  | { status: 'confirmed' | 'uncertain' | 'skipped' }
  | { status: 'rejected'; message: string }
)

export async function bookStudentSessions(studentId: string, sessionIds: string[]): Promise<StudentBookingResult[]> {
  const results: StudentBookingResult[] = []
  let interrupted = false
  for (const sessionId of new Set(sessionIds)) {
    if (interrupted) {
      results.push({ sessionId, status: 'skipped' })
      continue
    }
    try {
      const { error, status } = await supabase.rpc('book_session_multisite', {
        p_session: sessionId,
        p_student_id: studentId,
      })
      if (!error) {
        results.push({ sessionId, status: 'confirmed' })
      } else if (status !== 0 && status < 500) {
        results.push({ sessionId, status: 'rejected', message: error.message })
      } else {
        interrupted = true
        results.push({ sessionId, status: 'uncertain' })
      }
    } catch {
      interrupted = true
      results.push({ sessionId, status: 'uncertain' })
    }
  }
  return results
}

export async function fetchStudentBookingDetail(bookingId: string, studentId: string): Promise<StudentBookingDetail | null> {
  const { data, error } = await supabase.rpc('get_student_booking_detail', { p_booking_id: bookingId, p_student_id: studentId })
  if (error) throw error
  return data?.[0] || null
}

export type StudentBookingChangeWindow = {
  booking_id: string; student_id: string; status: string; start_at: string; booking_day_cutoff_at: string | null
}

export async function fetchStudentBookingChangeWindow(bookingId: string, studentId: string) {
  const { data, error } = await supabase.rpc('get_booking_detail', { p_booking_id: bookingId })
  if (error) throw error
  const row = data?.[0] as StudentBookingChangeWindow | undefined
  return row?.student_id === studentId ? row : null
}

export async function fetchStudentDayCutoffs(days: string[]): Promise<Record<string, string | null>> {
  return Object.fromEntries(await Promise.all(days.map(async day => {
    const { data, error } = await supabase.rpc('get_booking_day_cutoff', { p_session_date: day })
    if (error) throw error
    return [day, data as string | null] as const
  })))
}
