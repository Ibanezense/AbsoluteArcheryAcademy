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
    expect(sql).toMatch(/NEW\.end_date IS NOT NULL[\s\S]*NEW\.end_date < v_today/i)
    expect(sql).toMatch(/v_student\.account_access_blocked/i)
    expect(sql).toContain("v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')")
    expect(sql).toMatch(/v_student\.operational_status\s*=\s*'inactive'[\s\S]*UPDATE public\.students[\s\S]*operational_status\s*=\s*'active'[\s\S]*is_active\s*=\s*false/i)
    expect(sql).toContain('PERFORM public.sync_student_membership_operational_status(NEW.student_id)')
    expect(sql).toMatch(/UPDATE public\.profiles[\s\S]*SET[\s\S]*is_active\s*=\s*true[\s\S]*WHERE id = v_student\.self_profile_id[\s\S]*AND role = 'student'/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.student_guardians/i)
  })

  it('changes account access atomically without replacing the operational state', () => {
    const accessStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_set_student_account_access')
    const accessEnd = sql.indexOf('COMMENT ON FUNCTION public.admin_set_student_account_access')
    const accessSql = sql.slice(accessStart, accessEnd)

    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS account_access_blocked boolean NOT NULL DEFAULT false/i)
    expect(sql).toMatch(/UPDATE public\.students s[\s\S]*SET account_access_blocked = true[\s\S]*FROM public\.profiles p[\s\S]*p\.is_active = false/i)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_set_student_account_access\([\s\S]*p_student_id uuid,[\s\S]*p_is_active boolean/i)
    expect(sql).toMatch(/IF NOT public\.is_admin_user\(\)/i)
    expect(sql).toMatch(/UPDATE public\.students[\s\S]*account_access_blocked\s*=\s*NOT p_is_active/i)
    expect(sql).toMatch(/UPDATE public\.profiles[\s\S]*is_active\s*=\s*p_is_active[\s\S]*role\s*=\s*'student'/i)
    expect(accessStart).toBeGreaterThanOrEqual(0)
    expect(accessSql).not.toMatch(/operational_status\s*=/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_student_account_access\(uuid, boolean\) FROM PUBLIC/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_set_student_account_access\(uuid, boolean\) TO authenticated, service_role/i)
  })

  it('prioritizes a usable future membership over expired history', () => {
    const syncStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.sync_student_membership_operational_status')
    const triggerStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.reactivate_student_account_after_membership_insert')
    const syncSql = sql.slice(syncStart, triggerStart)
    const futureStatus = syncSql.indexOf('FROM public.student_memberships future_sm')
    const expiredStatus = syncSql.indexOf('WHEN latest_expired.id IS NOT NULL')

    expect(syncStart).toBeGreaterThanOrEqual(0)
    expect(futureStatus).toBeGreaterThanOrEqual(0)
    expect(expiredStatus).toBeGreaterThan(futureStatus)
    expect(syncSql).toMatch(/future_sm\.start_date > v_today[\s\S]*THEN 'paused'/i)
  })

  it('installs a restricted after-insert trigger', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reactivate_student_account_after_membership_insert\(\) FROM PUBLIC/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reactivate_student_account_after_membership_insert\(\) FROM anon/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reactivate_student_account_after_membership_insert\(\) FROM authenticated/i)
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_reactivate_student_account_after_membership_insert')
    expect(sql).toMatch(/CREATE TRIGGER trg_reactivate_student_account_after_membership_insert[\s\S]*AFTER INSERT ON public\.student_memberships[\s\S]*FOR EACH ROW[\s\S]*EXECUTE FUNCTION public\.reactivate_student_account_after_membership_insert\(\)/i)
  })
})
