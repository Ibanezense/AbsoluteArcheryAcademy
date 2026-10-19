import { supabase } from '@/lib/supabaseClient'

export type HistoryStatus = 'all' | 'reserved' | 'attended' | 'cancelled' | 'no_show' | 'expired_unattended'
export type HistoryOptions = { scope?: 'history' | 'upcoming'; month?: string; status?: HistoryStatus; page?: number }
export type StudentHistoryRow = {
  booking_id: string; start_at: string; end_at: string; status: string
  distance_m: number | null; bow_usage_type: string | null; bow_poundage: number | null
  student_membership_id: string | null; membership_code: string | null
  note: string | null; event_source: 'booking' | 'weekly' | 'expiry'
  cancellation_source: string | null; cancellation_resolution: string | null
}
export type StudentHistoryPage = {
  rows: StudentHistoryRow[]; total: number; page: number; pageSize: number
  summary: { upcoming: number; history: number; attended: number; currentCancelled: number; currentNoShow: number; currentMembershipId: string | null }
}
export async function fetchStudentBookingHistory(studentId: string, options: HistoryOptions = {}): Promise<StudentHistoryPage> {
  const { data, error } = await supabase.rpc('student_get_booking_history', {
    p_student_id: studentId, p_scope: options.scope || 'history',
    p_month: options.month ? `${options.month}-01` : null, p_status: options.status || 'all',
    p_page: options.page || 1, p_page_size: 10,
  })
  if (error) throw error
  if (!data || !Array.isArray(data.rows) || !data.summary) throw new Error('No se pudo obtener el historial completo.')
  return data as StudentHistoryPage
}
