import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_admin_attendance_reversal.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_admin_attendance_reversal.sql')

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

function reversalFunction(sql: string) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_reverse_no_show')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('REVOKE ALL ON FUNCTION', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('admin attendance reversal migration', () => {
  it('creates one auditable reversal for either attendance source', () => {
    const sql = migrationSql()

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.attendance_reversals')
    expect(sql).toContain('booking_id uuid')
    expect(sql).toContain('weekly_attendance_id uuid')
    expect(sql).toContain('original_ledger_id uuid')
    expect(sql).toContain('refund_ledger_id uuid')
    expect(sql).toContain('idempotency_key uuid NOT NULL UNIQUE')
    expect(sql).toMatch(/CHECK\s*\([\s\S]*booking_id IS NOT NULL[\s\S]*weekly_attendance_id IS NOT NULL[\s\S]*= 1[\s\S]*\)/i)
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*attendance_reversals\s*\(booking_id\)[\s\S]*booking_id IS NOT NULL/i)
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*attendance_reversals\s*\(weekly_attendance_id\)[\s\S]*weekly_attendance_id IS NOT NULL/i)
  })

  it('returns the consumed credit to the exact membership once', () => {
    const rpc = reversalFunction(migrationSql())

    expect(rpc).toContain('IF NOT public.is_admin_user()')
    expect(rpc).toContain('p_request_id')
    expect(rpc).toContain('FOR UPDATE')
    expect(rpc).toContain("movement_type = 'attendance_consumed'")
    expect(rpc).toContain("movement_type = 'weekly_no_show_consumed'")
    expect(rpc).toContain("'no_show_reversal_refund'")
    expect(rpc).toContain('classes_used = GREATEST(classes_used - 1, 0)')
    expect(rpc).toContain('classes_remaining = classes_remaining + 1')
    expect(rpc).toContain('INSERT INTO public.attendance_reversals')
  })

  it('requires a reason and restricts the privileged RPC', () => {
    const sql = migrationSql()
    const rpc = reversalFunction(sql)

    expect(rpc).toContain("NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL")
    expect(sql).toContain('ALTER TABLE public.attendance_reversals ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('FOR SELECT TO authenticated')
    expect(sql).toContain('USING ((SELECT public.is_admin_user()))')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) FROM PUBLIC;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) FROM anon;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_reverse_no_show(text, uuid, text, uuid) TO authenticated, service_role;')
  })
})
