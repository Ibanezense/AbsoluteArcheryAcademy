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
          occurrence_index: 1,
          note: null,
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

  it('keeps multiple weekly no-shows unique and orders later occurrences first', () => {
    const rows = buildStudentAttendanceHistory([], [
      {
        id: 'weekly-row-1',
        week_start: '2026-09-10',
        week_end: '2026-09-13',
        status: 'no_show',
        classes_consumed: 1,
        marked_at: '2026-09-13T20:00:00-05:00',
        occurrence_index: 1,
        note: 'Primera inasistencia semanal.',
      },
      {
        id: 'weekly-row-2',
        week_start: '2026-09-10',
        week_end: '2026-09-13',
        status: 'no_show',
        classes_consumed: 1,
        marked_at: '2026-09-13T20:05:00-05:00',
        occurrence_index: 2,
        note: 'Segunda inasistencia semanal.',
      },
    ])

    expect(rows.map((row) => row.id)).toEqual([
      'weekly-weekly-row-2',
      'weekly-weekly-row-1',
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(2)
    expect(rows.map((row) => row.occurrence_index)).toEqual([2, 1])
    expect(rows.map((row) => row.admin_notes)).toEqual([
      'Segunda inasistencia semanal.',
      'Primera inasistencia semanal.',
    ])
  })
})
