import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_admin_manual_student_inactive.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_admin_manual_student_inactive.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('admin manual student inactive migration', () => {
  it('persists inactive as a protected operational status', () => {
    expect(migrationName).toMatch(/^\d{14}_admin_manual_student_inactive\.sql$/)
    expect(sql).toMatch(/students_operational_status_chk[\s\S]*'inactive'/i)
    expect(sql).toMatch(/is_student_protected_operational_status[\s\S]*'inactive'/i)
  })

  it('exposes a secure admin-only reversible RPC without modifying profiles', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_set_student_inactive\(\s*p_student_id uuid,\s*p_inactive boolean/i)
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public')
    expect(sql).toContain('auth.uid() IS NULL')
    expect(sql).toContain('public.is_admin_user()')
    expect(sql).toMatch(/UPDATE public\.students[\s\S]*operational_status[\s\S]*'inactive'/i)
    expect(sql).toContain('Estado inactivo asignado manualmente por administrador')
    expect(sql).toMatch(/operational_status = 'inactive',[\s\S]*is_active = false/i)
    expect(sql).toMatch(/operational_status = 'active',[\s\S]*is_active = false/i)
    expect(sql).not.toMatch(/operational_status = 'active',[\s\S]*is_active = true/i)
    expect(sql).toContain("v_student.operational_status IN ('retired', 'withdrawn', 'blocked', 'suspended')")
    expect(sql).toContain('PERFORM public.sync_student_membership_operational_status(p_student_id)')
    expect(sql).not.toMatch(/UPDATE\s+public\.profiles/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_student_inactive\(uuid, boolean\) FROM PUBLIC/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_student_inactive\(uuid, boolean\) FROM anon/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_set_student_inactive\(uuid, boolean\) TO authenticated, service_role/i)
  })
})
