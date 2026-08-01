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
        candidates: [],
      },
      error: null,
    })

    await getWeeklyAttendanceReview(client, '2026-08-02')

    expect(client.rpc).toHaveBeenCalledWith('get_weekly_attendance_review', {
      p_sunday: '2026-08-02',
    })
  })

  it('marks one student through the privileged weekly no-show RPC', async () => {
    const client = rpcClient({
      data: { success: true, already_marked: false, classes_remaining: 3 },
      error: null,
    })

    await markWeeklyNoShow(client, {
      studentId: 'student-1',
      sunday: '2026-08-02',
    })

    expect(client.rpc).toHaveBeenCalledWith('admin_mark_weekly_no_show', {
      p_student_id: 'student-1',
      p_sunday: '2026-08-02',
    })
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
    })).rejects.toThrow('Alumno asistió')
  })
})
