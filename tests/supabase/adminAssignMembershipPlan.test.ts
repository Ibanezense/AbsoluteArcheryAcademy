import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260401_120000_accumulate_active_membership_renewals.sql'
)

describe('20260401 accumulate active membership renewals migration', () => {
  it('reuses the active membership row and accumulates credits on renewal', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('v_active_membership')
    expect(sql).toMatch(/FROM public\.student_memberships\s+WHERE student_id = p_student_id\s+AND status = 'active'/s)
    expect(sql).toMatch(/UPDATE public\.student_memberships[\s\S]*classes_total\s*=\s*v_active_membership\.classes_total\s*\+\s*v_plan\.classes_included/s)
    expect(sql).toMatch(/UPDATE public\.student_memberships[\s\S]*classes_remaining\s*=\s*v_active_membership\.classes_remaining\s*\+\s*v_plan\.classes_included/s)
    expect(sql).toMatch(/WHERE id = v_active_membership\.id/s)
    expect(sql).toContain("'membership_renewal'")
    expect(sql).not.toMatch(/SET\s+status\s*=\s*'historical'/s)
  })
})
