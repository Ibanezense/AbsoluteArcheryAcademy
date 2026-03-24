import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { mapStudentListRow } from '@/lib/queries/studentQueries'

describe('mapStudentListRow', () => {
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
      is_country_club_tiabaya_member: true,
      self_profile_id: null,
      guardians: null,
      memberships: [],
      self_profile: null,
    })

    expect((result as any).is_country_club_tiabaya_member).toBe(true)
  })
})
