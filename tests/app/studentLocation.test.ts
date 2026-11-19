import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { mapStudentListRow } from '@/lib/queries/studentQueries'
import StudentLocationBadge from '@/components/admin/StudentLocationBadge'
import StudentLocationSelect from '@/components/admin/StudentLocationSelect'

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/lib/infrastructureQueries', () => ({ useAcademyLocations: () => ({ data: [{ id: 't', name: 'Tiabaya', is_active: true }, { id: 'u', name: 'Umacollo', is_active: true }], isLoading: false, error: null }) }))

describe('student location in the list', () => {
  it('uses the saved location relation and supports either PostgREST relation shape', () => {
    for (const home_location of [{ name: 'Umacollo', code: 'umacollo' }, [{ name: 'Umacollo', code: 'umacollo' }]]) {
      const row = mapStudentListRow({ id: 'student', home_location_id: 'site', home_location, memberships: [] })
      expect(row.home_location_name).toBe('Umacollo')
      expect(row.home_location_id).toBe('site')
    }
  })
  it('does not infer location from club affiliation', () => {
    expect(mapStudentListRow({ id: 'student', is_country_club_tiabaya_member: true, memberships: [] }).home_location_name).toBeNull()
  })
  it('shows both locations as an explicit selection', () => {
    const row = mapStudentListRow({ id: 'student', both_locations: true, memberships: [] })
    expect(row.home_location_name).toBe('Ambas')
    expect(row.home_location_id).toBe('both')
  })
  it('offers both sites and preserves a saved Both selection', () => {
    const html = renderToStaticMarkup(React.createElement(StudentLocationSelect, { value: 'both', onChange: () => {} }))
    expect(html).toContain('Tiabaya')
    expect(html).toContain('Umacollo')
    expect(html).toContain('value="both" selected=""')
    expect(html).toContain('Ambas sedes')
  })
  it('labels unassigned students and distinguishes the two sites with text and color', () => {
    const render = (name?: string) => renderToStaticMarkup(React.createElement(StudentLocationBadge, { name }))
    expect(render()).toContain('Sin sede asignada')
    expect(render('Tiabaya')).toContain('bg-blue-50')
    expect(render('Umacollo')).toContain('bg-violet-50')
  })
})
