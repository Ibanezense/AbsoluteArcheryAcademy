import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_reactivate_account_on_membership.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_reactivate_account_on_membership.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('reactivate account after membership assignment', () => {
  it('reactivates only eligible individual accounts in the membership transaction', () => {
    expect(migrationName).toMatch(/^\d{14}_reactivate_account_on_membership\.sql$/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reactivate_student_account_after_membership_insert\(\)/i)
    expect(sql).toContain('RETURNS trigger')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public')
    expect(sql).toMatch(/NEW\.status\s*<>\s*'active'/i)
    expect(sql).toMatch(/COALESCE\(NEW\.classes_remaining, 0\)\s*<=\s*0/i)
    expect(sql).toContain("v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')")
    expect(sql).toMatch(/v_student\.operational_status\s*=\s*'inactive'[\s\S]*UPDATE public\.students[\s\S]*operational_status\s*=\s*'active'[\s\S]*is_active\s*=\s*false/i)
    expect(sql).toContain('PERFORM public.sync_student_membership_operational_status(NEW.student_id)')
    expect(sql).toMatch(/UPDATE public\.profiles[\s\S]*SET[\s\S]*is_active\s*=\s*true[\s\S]*WHERE id = v_student\.self_profile_id/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.student_guardians/i)
  })

  it('installs a restricted after-insert trigger', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reactivate_student_account_after_membership_insert\(\) FROM PUBLIC/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reactivate_student_account_after_membership_insert\(\) FROM anon/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reactivate_student_account_after_membership_insert\(\) FROM authenticated/i)
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_reactivate_student_account_after_membership_insert')
    expect(sql).toMatch(/CREATE TRIGGER trg_reactivate_student_account_after_membership_insert[\s\S]*AFTER INSERT ON public\.student_memberships[\s\S]*FOR EACH ROW[\s\S]*EXECUTE FUNCTION public\.reactivate_student_account_after_membership_insert\(\)/i)
  })
})
