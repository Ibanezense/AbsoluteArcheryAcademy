import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function migration(path: string) {
  return readFileSync(join(process.cwd(), 'supabase/migrations', path), 'utf8')
}

describe('future active membership read surfaces', () => {
  it('does not mark a newly created future-start membership as expired in student or guardian reads', () => {
    const sql = migration('20260609_090000_future_active_memberships_are_not_expired.sql')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_student_dashboard')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_children')
    expect(sql).toContain('v_has_usable_membership boolean')
    expect(sql).toContain('sm_inner.status = \'active\'')
    expect(sql).toContain('COALESCE(sm_inner.classes_remaining, 0) > 0')
    expect(sql).toContain('(sm_inner.end_date IS NULL OR sm_inner.end_date >= v_today')
    expect(sql).toContain('THEN \'active\'')
    expect(sql).toContain('AND COALESCE(sm.classes_remaining, 0) > 0')
    expect(sql).not.toContain('AND sm.start_date <= v_today_lima')
    expect(sql).not.toContain('AND sm_inner.start_date <= v_today_lima')
    expect(sql).not.toContain('AND active_sm.start_date <= v_today')
  })
})
