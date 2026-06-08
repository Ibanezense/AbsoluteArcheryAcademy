import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260608_110000_fix_admin_audit_deleted_student_refs.sql',
)

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

describe('admin audit deleted student references migration', () => {
  it('prevents audit inserts from keeping broken FK references during student deletion cascades', () => {
    const sql = migrationSql()

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.log_admin_action(')
    expect(sql).toContain('v_student_id uuid')
    expect(sql).toContain('v_metadata jsonb')
    expect(sql).toContain('SELECT p_student_id')
    expect(sql).toContain('FROM public.students')
    expect(sql).toContain('WHERE id = p_student_id')
    expect(sql).toContain("'original_student_id'")
    expect(sql).toContain('student_id,')
    expect(sql).toContain('v_student_id,')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.log_admin_action')
  })
})
