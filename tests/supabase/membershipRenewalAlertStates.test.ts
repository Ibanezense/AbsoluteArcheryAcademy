import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_membership_renewal_alert_states.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_membership_renewal_alert_states.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('canonical membership renewal alert states RPC', () => {
  it('exposes the complete batch contract and canonical alert states', () => {
    expect(migrationName).toMatch(/^\d{14}_membership_renewal_alert_states\.sql$/)
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_membership_renewal_alert_states\(\s*p_student_ids uuid\[\] DEFAULT NULL\s*\)/i,
    )
    expect(sql).toMatch(/RETURNS TABLE\s*\(\s*student_id uuid,\s*alert_state text,\s*remaining_unconsumed_classes integer,\s*has_current_membership boolean,\s*has_scheduled_membership boolean,\s*state_key text\s*\)/i)
    expect(sql).toContain("'last_class'")
    expect(sql).toContain("'expired'")
    expect(sql).toContain("'none'")
  })

  it('uses Lima dates and sums raw remaining classes across every eligible cycle', () => {
    expect(sql).toContain("AT TIME ZONE 'America/Lima'")
    expect(sql).toMatch(/FROM public\.student_memberships sm/i)
    expect(sql).toMatch(/sm\.status\s*=\s*'active'/i)
    expect(sql).toMatch(/COALESCE\(sm\.classes_remaining,\s*0\)\s*>\s*0/i)
    expect(sql).toMatch(/sm\.end_date IS NULL\s+OR\s+sm\.end_date >= v_today/i)
    expect(sql).toMatch(/SUM\(COALESCE\(sm\.classes_remaining,\s*0\)\)/i)
    expect(sql).toMatch(/BOOL_OR\(sm\.start_date <= v_today\)/i)
    expect(sql).toMatch(/BOOL_OR\(sm\.start_date > v_today\)/i)
  })

  it('requires a current cycle for last-class and preserves valid future balances', () => {
    expect(sql).toMatch(/WHEN\s+[^\n]*has_current_membership[^\n]*AND[^\n]*remaining_unconsumed_classes\s*=\s*1[^\n]*THEN\s+'last_class'/i)
    expect(sql).toMatch(/WHEN\s+[^\n]*remaining_unconsumed_classes\s*>\s*1[^\n]*THEN\s+'none'/i)
    expect(sql).toMatch(/WHEN\s+[^\n]*has_scheduled_membership[^\n]*THEN\s+'none'/i)
    expect(sql).toMatch(/WHEN\s+[^\n]*has_membership_history[^\n]*THEN\s+'expired'/i)
  })

  it('does not treat reserved bookings as consumed classes', () => {
    expect(sql).not.toBe('')
    expect(sql).not.toMatch(/FROM public\.bookings/i)
    expect(sql).not.toMatch(/status\s*=\s*'reserved'/i)
    expect(sql).not.toMatch(/classes_remaining[\s\S]{0,120}-[\s\S]{0,120}reserved/i)
  })

  it('builds a deterministic state key from ordered membership identity and dates', () => {
    expect(sql).toMatch(/STRING_AGG\([\s\S]*sm\.id::text[\s\S]*sm\.start_date::text[\s\S]*ORDER BY sm\.start_date, sm\.created_at, sm\.id/i)
    expect(sql).toMatch(/MD5\([\s\S]*membership_fingerprint/i)
    expect(sql).toMatch(/alert_state[\s\S]*\|\| ':' \|\|[\s\S]*MD5/i)
  })

  it('authorizes every requested student and restricts function execution', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('public.is_admin_user()')
    expect(sql).toContain('public.can_access_student')
    expect(sql).toMatch(/FOREACH\s+v_student_id\s+IN\s+ARRAY/i)
    expect(sql).toMatch(/RAISE EXCEPTION 'No autenticado'/i)
    expect(sql).toMatch(/RAISE EXCEPTION 'No autorizado para consultar este alumno'/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_membership_renewal_alert_states\(uuid\[\]\) FROM PUBLIC;/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_membership_renewal_alert_states\(uuid\[\]\) FROM anon;/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_membership_renewal_alert_states\(uuid\[\]\) TO authenticated, service_role;/i)
  })
})
