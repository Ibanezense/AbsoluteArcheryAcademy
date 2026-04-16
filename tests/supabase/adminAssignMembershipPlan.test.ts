import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260416_100000_restore_new_membership_cycles.sql'
)

describe('20260416 restore new membership cycles migration', () => {
  it('moves previous active memberships to history and creates a clean active membership', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/UPDATE public\.student_memberships[\s\S]*status = 'historical'[\s\S]*WHERE student_id = p_student_id[\s\S]*AND status = 'active'/s)
    expect(sql).toMatch(/INSERT INTO public\.student_memberships[\s\S]*classes_total[\s\S]*classes_used[\s\S]*classes_remaining/s)
    expect(sql).toMatch(/VALUES \([\s\S]*v_plan\.classes_included,[\s\S]*0,[\s\S]*v_plan\.classes_included/s)
    expect(sql).toContain("'membership_activation'")
    expect(sql).not.toContain('v_active_membership.classes_total + v_plan.classes_included')
    expect(sql).not.toContain('v_active_membership.classes_remaining + v_plan.classes_included')
  })
})
