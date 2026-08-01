type RpcError = {
  message?: string
}

export type RpcClient = {
  rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: RpcError | null }>
}

export type WeeklyAttendanceCandidate = {
  student_id: string
  student_name: string
  avatar_url: string | null
  membership_id: string
  membership_name: string
  membership_end: string | null
  classes_remaining: number
  membership_display_status: 'active' | 'expiring'
}

export type WeeklyAttendanceReview = {
  is_sunday: boolean
  week_start: string | null
  week_end: string | null
  pending_count: number
  candidates: WeeklyAttendanceCandidate[]
}

export type MarkWeeklyNoShowResult = {
  success: boolean
  already_marked: boolean
  weekly_attendance_id?: string
  classes_remaining?: number
  error?: string
}

export async function getWeeklyAttendanceReview(
  client: RpcClient,
  sunday: string,
): Promise<WeeklyAttendanceReview> {
  const { data, error } = await client.rpc('get_weekly_attendance_review', {
    p_sunday: sunday,
  })

  if (error) throw new Error(error.message || 'No se pudo cargar la revisión semanal.')
  if (!data) throw new Error('La revisión semanal no devolvió información.')

  return data as WeeklyAttendanceReview
}

export async function markWeeklyNoShow(
  client: RpcClient,
  input: { studentId: string; sunday: string },
): Promise<MarkWeeklyNoShowResult> {
  const { data, error } = await client.rpc('admin_mark_weekly_no_show', {
    p_student_id: input.studentId,
    p_sunday: input.sunday,
  })

  if (error) throw new Error(error.message || 'No se pudo registrar la inasistencia semanal.')

  const result = data as MarkWeeklyNoShowResult | null
  if (!result?.success) {
    throw new Error(result?.error || 'No se pudo registrar la inasistencia semanal.')
  }

  return result
}
