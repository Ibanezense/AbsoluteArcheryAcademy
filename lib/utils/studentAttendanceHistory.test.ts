import { describe, expect, it } from 'vitest'
import { buildStudentAttendanceHistory } from './studentAttendanceHistory'

describe('buildStudentAttendanceHistory', () => {
  it('combines booking attendance and weekly no-shows in reverse chronological order', () => {
    const rows = buildStudentAttendanceHistory(
      [
        {
          id: 'booking-1',
          session_id: 'session-1',
          active_membership_id: null,
          status: 'attended',
          distance_m: 18,
          bow_usage_type: 'own',
          bow_poundage: null,
          admin_notes: null,
          start_at: '2026-07-31T18:00:00-05:00',
          end_at: '2026-07-31T19:00:00-05:00',
        },
      ],
      [
        {
          id: 'weekly-1',
          week_start: '2026-07-23',
          week_end: '2026-07-26',
          status: 'no_show',
          classes_consumed: 1,
          marked_at: '2026-07-26T21:00:00-05:00',
        },
      ],
    )

    expect(rows.map((row) => row.id)).toEqual(['booking-1', 'weekly-weekly-1'])
    expect(rows[1]).toMatchObject({
      source: 'weekly',
      status: 'no_show',
      start_at: '2026-07-26',
      admin_notes: 'Inasistencia semanal (jueves a domingo)',
    })
  })
})
