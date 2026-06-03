import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { mapStudentListRow } from '@/lib/queries/studentQueries'

describe('mapStudentListRow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
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
})
