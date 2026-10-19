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

export async function fetchStudentBookingDetail(bookingId: string, studentId: string): Promise<StudentBookingDetail | null> {
  const { data, error } = await supabase.rpc('get_student_booking_detail', { p_booking_id: bookingId, p_student_id: studentId })
  if (error) throw error
  return data?.[0] || null
}
