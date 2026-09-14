import { describe, expect, it, vi } from 'vitest'
import {
  getWeeklyAttendanceReview,
  markWeeklyNoShow,
} from '@/lib/services/adminWeeklyAttendanceService'

function rpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe('admin weekly attendance service', () => {
  it('loads the Sunday review using the expected RPC contract', async () => {
    const client = rpcClient({
      data: {
        is_sunday: true,
        week_start: '2026-07-30',
        week_end: '2026-08-02',
        pending_count: 0,
        candidates: [
          {
            student_id: 'student-1',
            student_name: 'Camila',
            avatar_url: null,
            membership_id: 'membership-1',
            membership_name: 'Plan 3 veces por semana',
            membership_end: '2026-08-31',
            classes_remaining: 5,
            membership_available_classes: 4,
            available_classes: 6,
            membership_display_status: 'active',
            weekly_class_target: 3,
            attended_count: 1,
            booking_no_show_count: 0,
            weekly_no_show_count: 1,
            completed_count: 2,
            missing_count: 1,
          },
        ],
      },
      error: null,
    })

    const review = await getWeeklyAttendanceReview(client, '2026-08-02')

    expect(client.rpc).toHaveBeenCalledWith('get_weekly_attendance_review', {
      p_sunday: '2026-08-02',
    })
    expect(review.candidates[0]).toMatchObject({
      weekly_class_target: 3,
      attended_count: 1,
      booking_no_show_count: 0,
      weekly_no_show_count: 1,
      completed_count: 2,
      missing_count: 1,
    })
  })

  it('marks one student through the idempotent three-argument RPC', async () => {
    const client = rpcClient({
      data: {
        success: true,
        already_marked: false,
        weekly_attendance_id: 'weekly-1',
        classes_remaining: 3,
        remaining_missing_count: 1,
      },
      error: null,
    })

    const result = await markWeeklyNoShow(client, {
      studentId: 'student-1',
      sunday: '2026-08-02',
      requestId: 'request-1',
    })

    expect(client.rpc).toHaveBeenCalledWith('admin_mark_weekly_no_show', {
      p_student_id: 'student-1',
      p_sunday: '2026-08-02',
      p_request_id: 'request-1',
    })
    expect(result.remaining_missing_count).toBe(1)
  })

  it('surfaces transport errors', async () => {
    const client = rpcClient({ data: null, error: { message: 'Sin conexión' } })

    await expect(getWeeklyAttendanceReview(client, '2026-08-02')).rejects.toThrow('Sin conexión')
  })

  it('rejects unsuccessful business responses', async () => {
    const client = rpcClient({ data: { success: false, error: 'Alumno asistió' }, error: null })

    await expect(markWeeklyNoShow(client, {
      studentId: 'student-1',
      sunday: '2026-08-02',
      requestId: 'request-2',
    })).rejects.toThrow('Alumno asistió')
  })
})
