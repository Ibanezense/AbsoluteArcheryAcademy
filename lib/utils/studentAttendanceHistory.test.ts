import { describe, expect, it } from 'vitest'
import {
  buildStudentAttendanceHistory,
  formatAttendanceMembershipMonth,
} from './studentAttendanceHistory'

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
          student_membership_id: 'membership-september',
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
      source_event_id: 'weekly-1',
      active_membership_id: 'membership-september',
      status: 'no_show',
      start_at: '2026-07-26',
      admin_notes: 'Inasistencia semanal (jueves a domingo)',
    })
  })

  it('keeps multiple weekly no-shows unique and orders later occurrences first', () => {
    const rows = buildStudentAttendanceHistory([], [
      {
        id: 'weekly-row-1',
        student_membership_id: 'membership-september',
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
        student_membership_id: 'membership-september',
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

  it('keeps the membership that consumed each attendance source', () => {
    const rows = buildStudentAttendanceHistory(
      [{
        id: 'booking-1',
        session_id: 'session-1',
        active_membership_id: 'membership-october',
        status: 'no_show',
        distance_m: 20,
        bow_usage_type: 'shared_inventory',
        bow_poundage: 20,
        admin_notes: null,
        start_at: '2026-10-03T10:00:00-05:00',
        end_at: '2026-10-03T11:30:00-05:00',
      }],
      [{
        id: 'weekly-1',
        student_membership_id: 'membership-september',
        week_start: '2026-09-21',
        week_end: '2026-09-27',
        status: 'no_show',
        classes_consumed: 1,
        marked_at: '2026-09-27T21:00:00-05:00',
        occurrence_index: 1,
        note: null,
      }],
      [],
    )

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'booking',
        source_event_id: 'booking-1',
        active_membership_id: 'membership-october',
      }),
      expect.objectContaining({
        source: 'weekly',
        source_event_id: 'weekly-1',
        active_membership_id: 'membership-september',
      }),
    ]))
  })

  it('removes reversed booking and weekly no-shows from visible history', () => {
    const rows = buildStudentAttendanceHistory(
      [{
        id: 'booking-reversed',
        session_id: 'session-1',
        active_membership_id: 'membership-1',
        status: 'no_show',
        distance_m: 20,
        bow_usage_type: 'shared_inventory',
        bow_poundage: 20,
        admin_notes: null,
        start_at: '2026-09-20T10:00:00-05:00',
        end_at: '2026-09-20T11:30:00-05:00',
      }],
      [{
        id: 'weekly-reversed',
        student_membership_id: 'membership-1',
        week_start: '2026-09-14',
        week_end: '2026-09-20',
        status: 'no_show',
        classes_consumed: 1,
        marked_at: '2026-09-20T21:00:00-05:00',
        occurrence_index: 1,
        note: null,
      }],
      [
        { id: 'reversal-1', booking_id: 'booking-reversed', weekly_attendance_id: null },
        { id: 'reversal-2', booking_id: null, weekly_attendance_id: 'weekly-reversed' },
      ],
    )

    expect(rows).toEqual([])
  })
})

describe('formatAttendanceMembershipMonth', () => {
  it('formats the cycle start month in Spanish with a safe fallback', () => {
    const memberships = [
      { id: 'membership-september', start_date: '2026-09-01' },
      { id: 'membership-october', start_date: '2026-10-01' },
    ]

    expect(formatAttendanceMembershipMonth('membership-september', memberships)).toBe('Setiembre')
    expect(formatAttendanceMembershipMonth('membership-october', memberships)).toBe('Octubre')
    expect(formatAttendanceMembershipMonth(null, memberships)).toBe('Sin membresía')
    expect(formatAttendanceMembershipMonth('missing', memberships)).toBe('Sin membresía')
  })
})
