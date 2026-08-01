import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260801_190000_multiple_active_student_memberships.sql'
)

describe('20260801 multiple active membership cycles migration', () => {
  it('creates a separate active membership without replacing active siblings', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_assign_membership_plan')
    expect(sql).toMatch(/INSERT INTO public\.student_memberships[\s\S]*classes_total[\s\S]*classes_used[\s\S]*classes_remaining/s)
    expect(sql).toMatch(/VALUES \([\s\S]*v_plan\.classes_included,[\s\S]*0,[\s\S]*v_plan\.classes_included/s)
    expect(sql).toContain("'membership_activation'")
    expect(sql).toContain("'paid'")
    expect(sql).not.toMatch(/UPDATE public\.student_memberships[\s\S]*status = 'historical'[\s\S]*WHERE student_id = p_student_id/)
  })
})
