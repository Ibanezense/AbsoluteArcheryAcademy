import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { buildLastAttendanceByStudent, mapStudentListRow } from '@/lib/queries/studentQueries'

describe('mapStudentListRow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a manually inactive status even when an active membership exists', () => {
    const result = mapStudentListRow({
      id: 'student-manual-inactive',
      full_name: 'Alumno inactivo manual',
      is_active: true,
      operational_status: 'inactive',
      memberships: [{
        id: 'active-membership',
        custom_name: 'Plan vigente',
        classes_total: 8,
        classes_remaining: 8,
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        status: 'active',
        created_at: '2026-06-01T00:00:00Z',
      }],
    })

    expect(result.effective_operational_status).toBe('inactive')
  })

  it('preserves the CCT affiliation flag on list rows', () => {
    const result = mapStudentListRow({
      id: 'student-1',
      full_name: 'Alumno Ejemplo',
      avatar_url: null,
      date_of_birth: null,
      dni: null,
      phone: null,
      email: null,
      current_distance_m: null,
      division: null,
      gender: null,
      category: null,
      level: null,
      has_own_bow: false,
      assigned_bow: false,
      bow_poundage: null,
      is_active: true,
      operational_status: null,
      is_country_club_tiabaya_member: true,
      self_profile_id: null,
      guardians: null,
      memberships: [],
      self_profile: null,
    })

    expect((result as any).is_country_club_tiabaya_member).toBe(true)
  })

  it('derives expired instead of active/expiring when an active membership has no classes left', () => {
    const result = mapStudentListRow({
      id: 'student-qhari',
      full_name: 'Qhari Samin Zuniga Cano',
      avatar_url: null,
      date_of_birth: null,
      dni: null,
      phone: null,
      email: null,
      current_distance_m: 15,
      division: 'Recurvo',
      gender: null,
      category: null,
      level: 'En Desarrollo',
      has_own_bow: false,
      assigned_bow: false,
      bow_poundage: null,
      is_active: true,
      operational_status: null,
      is_country_club_tiabaya_member: false,
      self_profile_id: null,
      guardians: null,
      self_profile: null,
      memberships: [
        {
          custom_name: 'Afiliados Country 8 clases',
          classes_remaining: 0,
          start_date: '2026-04-25',
          end_date: '2026-05-25',
          expired_at: null,
          status: 'active',
          created_at: '2026-04-25T12:00:00.000Z',
        },
      ],
    })

    expect(result.membership_status).toBe('expired')
    expect(result.effective_operational_status).toBe('expired')
    expect(result.membership_raw_classes_remaining).toBe(0)
    expect(result.classes_remaining).toBe(0)
  })

  it('derives paused after 14 complete days from expiration when sync data is stale', () => {
    const result = mapStudentListRow({
      id: 'student-martha',
      full_name: 'Martha Fernandez Mendoza',
      avatar_url: null,
      date_of_birth: null,
      dni: null,
      phone: null,
      email: null,
      current_distance_m: 18,
      division: 'Recurvo',
      gender: null,
      category: null,
      level: 'Intermedio',
      has_own_bow: false,
      assigned_bow: false,
      bow_poundage: null,
      is_active: true,
      operational_status: null,
      is_country_club_tiabaya_member: false,
      self_profile_id: null,
      guardians: null,
      self_profile: null,
      memberships: [
        {
          custom_name: 'Plan vencido',
          classes_remaining: 2,
          start_date: '2026-04-18',
          end_date: '2026-05-18',
          expired_at: null,
          status: 'active',
          created_at: '2026-04-18T12:00:00.000Z',
        },
      ],
    })

    expect(result.membership_status).toBe('expired')
    expect(result.effective_operational_status).toBe('paused')
    expect(result.membership_raw_classes_remaining).toBe(2)
    expect(result.classes_remaining).toBe(0)
  })

  it('preserves enrollment and latest attendance dates on list rows', () => {
    const result = mapStudentListRow({
      id: 'student-dates',
      full_name: 'Alumno con fechas',
      avatar_url: null,
      date_of_birth: null,
      dni: null,
      phone: null,
      email: null,
      current_distance_m: null,
      division: null,
      gender: null,
      category: null,
      level: null,
      has_own_bow: false,
      assigned_bow: false,
      bow_poundage: null,
      is_active: true,
      operational_status: null,
      is_country_club_tiabaya_member: false,
      self_profile_id: null,
      guardians: null,
      memberships: [],
      self_profile: null,
      created_at: '2026-03-10T14:00:00.000Z',
      last_attendance_at: '2026-07-12T21:00:00.000Z',
    })

    expect(result.created_at).toBe('2026-03-10T14:00:00.000Z')
    expect(result.last_attendance_at).toBe('2026-07-12T21:00:00.000Z')
  })

  it('keeps the current FIFO balance separate from all open membership classes', () => {
    const result = mapStudentListRow({
      id: 'student-fifo',
      full_name: 'Alumno FIFO',
      is_active: true,
      operational_status: null,
      memberships: [
        {
          id: 'future',
          custom_name: 'Plan futuro',
          classes_total: 8,
          classes_remaining: 8,
          start_date: '2026-07-01',
          end_date: '2026-07-31',
          expired_at: null,
          status: 'active',
          created_at: '2026-06-02T12:00:00.000Z',
          membership_origin: 'paid',
        },
        {
          id: 'current',
          custom_name: 'Plan antiguo',
          classes_total: 4,
          classes_remaining: 2,
          start_date: '2026-06-01',
          end_date: '2026-06-30',
          expired_at: null,
          status: 'active',
          created_at: '2026-06-01T12:00:00.000Z',
          membership_origin: 'paid',
        },
      ],
    })

    expect(result.membership_name).toBe('Plan antiguo')
    expect(result.classes_remaining).toBe(2)
    expect(result.total_open_classes).toBe(10)
    expect(result.open_membership_count).toBe(2)
  })

  it('breaks overlapping membership ties by created_at and id', () => {
    const result = mapStudentListRow({
      id: 'student-overlap',
      full_name: 'Alumno solapado',
      is_active: true,
      operational_status: null,
      memberships: [
        {
          id: 'membership-z',
          custom_name: 'Creada despues',
          classes_total: 8,
          classes_remaining: 8,
          start_date: '2026-06-01',
          end_date: '2026-06-30',
          expired_at: null,
          status: 'active',
          created_at: '2026-06-02T12:00:00.000Z',
          membership_origin: 'paid',
        },
        {
          id: 'membership-a',
          custom_name: 'Creada primero',
          classes_total: 4,
          classes_remaining: 2,
          start_date: '2026-06-01',
          end_date: '2026-06-30',
          expired_at: null,
          status: 'active',
          created_at: '2026-06-01T12:00:00.000Z',
          membership_origin: 'gift',
        },
      ],
    })

    expect(result.membership_name).toBe('Creada primero')
    expect(result.classes_remaining).toBe(2)
  })

  it('counts a future cycle as open without presenting its balance as usable today', () => {
    const result = mapStudentListRow({
      id: 'student-future',
      full_name: 'Alumno futuro',
      is_active: true,
      operational_status: null,
      memberships: [{
        id: 'future-only',
        custom_name: 'Plan futuro',
        classes_total: 8,
        classes_remaining: 8,
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        expired_at: null,
        status: 'active',
        created_at: '2026-06-03T12:00:00.000Z',
        membership_origin: 'paid',
      }],
    })

    expect(result.membership_status).toBe('scheduled')
    expect(result.classes_remaining).toBe(0)
    expect(result.total_open_classes).toBe(8)
    expect(result.open_membership_count).toBe(1)
  })

  it('uses the Lima business date at the UTC day boundary', () => {
    vi.setSystemTime(new Date('2026-06-04T04:30:00.000Z'))

    const result = mapStudentListRow({
      id: 'student-lima-boundary',
      full_name: 'Alumno Lima',
      is_active: true,
      operational_status: null,
      memberships: [
        {
          id: 'today-in-lima', custom_name: 'Vigente hoy', classes_total: 2, classes_remaining: 2,
          start_date: '2026-06-01', end_date: '2026-06-03', status: 'active', created_at: '2026-06-01T00:00:00Z',
        },
        {
          id: 'tomorrow-in-lima', custom_name: 'Empieza mañana', classes_total: 4, classes_remaining: 4,
          start_date: '2026-06-04', end_date: '2026-07-03', status: 'active', created_at: '2026-06-02T00:00:00Z',
        },
      ],
    })

    expect(result.membership_name).toBe('Vigente hoy')
    expect(result.membership_status).toBe('active')
    expect(result.classes_remaining).toBe(2)
  })

  it('keeps the current FIFO cycle visible while exposing the next bookable balance', () => {
    const result = mapStudentListRow({
      id: 'student-committed',
      full_name: 'Alumno comprometido',
      is_active: true,
      operational_status: null,
      memberships: [
        {
          id: 'older', custom_name: 'Plan antiguo', classes_total: 2, classes_remaining: 2,
          start_date: '2026-06-01', end_date: '2026-06-30', status: 'active', created_at: '2026-06-01T00:00:00Z',
        },
        {
          id: 'next', custom_name: 'Plan siguiente', classes_total: 3, classes_remaining: 3,
          start_date: '2026-06-01', end_date: '2026-06-30', status: 'active', created_at: '2026-06-02T00:00:00Z',
        },
      ],
    }, new Map([['older', 2]]))

    expect(result.membership_name).toBe('Plan antiguo')
    expect(result.classes_remaining).toBe(0)
    expect(result.bookable_membership_id).toBe('next')
    expect(result.usable_classes).toBe(3)
    expect(result.total_open_classes).toBe(5)
  })

  it('keeps the newest attended class date for each student', () => {
    const result = buildLastAttendanceByStudent([
      {
        student_id: 'student-1',
        attendance_marked_at: null,
        sessions: { start_at: '2026-07-10T20:00:00Z' },
      },
      {
        student_id: 'student-1',
        attendance_marked_at: null,
        sessions: { start_at: '2026-07-12T20:00:00Z' },
      },
      {
        student_id: 'student-2',
        attendance_marked_at: '2026-07-11T19:00:00Z',
        sessions: null,
      },
    ])

    expect(result).toEqual(new Map([
      ['student-1', '2026-07-12T20:00:00Z'],
      ['student-2', '2026-07-11T19:00:00Z'],
    ]))
  })
})
