import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260603_090000_student_operational_status_automation.sql',
)
const reconciliationPath = join(
  process.cwd(),
  'supabase',
  'reconciliation',
  '20260603_student_operational_status_reconciliation.sql',
)

describe('student operational status automation migration', () => {
  it('adds persisted operational status fields with protected manual states', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS operational_status text')
    expect(sql).toContain('students_operational_status_chk')
    expect(sql).toContain("'retired'")
    expect(sql).toContain("'withdrawn'")
    expect(sql).toContain("'blocked'")
    expect(sql).toContain("'suspended'")
    expect(sql).toContain('public.is_student_protected_operational_status')
    expect(sql).toContain('NOT public.is_student_protected_operational_status')
  })

  it('uses America/Lima business time and changes to paused from expired_at on day 15', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("now() AT TIME ZONE 'America/Lima'")
    expect(sql).toContain('expired_at')
    expect(sql).toContain("expiration_reason = COALESCE(expiration_reason, 'end_date')")
    expect(sql).toContain("expiration_reason = COALESCE(expiration_reason, 'no_classes_remaining')")
    expect(sql).toContain("interval '14 days'")
    expect(sql).toContain("'paused'")
    expect(sql).toContain('Mas de 14 dias completos sin membresia activa')
    expect(sql).toContain("jobname = 'student-operational-status-sync-lima'")
    expect(sql).toContain("'0 8 * * *'")
  })

  it('marks exhausted active memberships as expired and never negative', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/status = 'expired'[\s\S]*classes_remaining = 0/s)
    expect(sql).toContain("AND status = 'active'")
    expect(sql).toContain('AND classes_remaining <= 0')
    expect(sql).not.toContain("status = 'consumed'")
    expect(sql).toContain("CASE WHEN TG_OP = 'UPDATE' THEN OLD.expired_at ELSE NULL END")
    expect(sql).toContain("CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END")
  })

  it('replaces the current active membership with a clean new cycle on sale', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_assign_membership_plan')
    expect(sql).toMatch(/UPDATE public\.student_memberships[\s\S]*status = 'historical'[\s\S]*WHERE student_id = p_student_id[\s\S]*AND status = 'active'/s)
    expect(sql).toMatch(/INSERT INTO public\.student_memberships[\s\S]*classes_used[\s\S]*classes_remaining/s)
    expect(sql).toContain('v_plan.classes_included')
    expect(sql).toContain("operational_status = 'active'")
    expect(sql).toContain('is_active = true')
    expect(sql).toContain('classes_used,')
    expect(sql).toContain('0,')
    expect(sql).toContain('Existen alumnos con mas de una membresia activa')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_student_memberships_one_active')
    expect(sql).toContain("WHERE status = 'active'")
  })

  it('syncs from membership writes without exposing the sync RPC to authenticated users', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TRIGGER trg_normalize_membership_expiration_before_write')
    expect(sql).toContain('CREATE TRIGGER trg_sync_student_operational_status_after_membership_change')
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.student_memberships')
    expect(sql).toContain('pg_trigger_depth() > 1')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.sync_student_membership_operational_status(uuid) FROM PUBLIC')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO service_role')
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.sync_student_membership_operational_status(uuid) TO authenticated')
  })

  it('blocks reservation RPCs and read surfaces for expired or paused students', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.book_session')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_book_session')
    expect(sql).toContain("COALESCE(v_student.operational_status, 'active') <> 'active'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_available_sessions_for_student')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_student_dashboard')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_student_class_cards')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_children')
    expect(sql).toContain("AND sm.status = 'active'")
    expect(sql).toContain('AND COALESCE(sm.classes_remaining, 0) > 0')
    expect(sql).toMatch(/student_is_active[\s\S]*EXISTS \([\s\S]*FROM public\.student_memberships active_sm[\s\S]*active_sm\.status = 'active'[\s\S]*COALESCE\(active_sm\.classes_remaining, 0\) > 0/s)
    expect(sql).toMatch(/get_my_children\(\)[\s\S]*COALESCE\(base\.operational_status, 'active'\) = 'active'[\s\S]*COALESCE\(sm\.classes_remaining, 0\) > 0/s)
    expect(sql).not.toContain('UPDATE public.bookings')
    expect(sql).not.toContain('DELETE FROM public.bookings')
  })

  it('keeps historical reconciliation separate and non-executable by default', () => {
    expect(existsSync(reconciliationPath)).toBe(true)

    const sql = readFileSync(reconciliationPath, 'utf8')
    const executableLines = sql
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('--'))

    expect(reconciliationPath).not.toContain(`${join('supabase', 'migrations')}`)
    expect(sql).toContain('DO NOT RUN WHOLE FILE IN PRODUCTION')
    expect(sql).toContain('No ejecutar actualizaciones')
    expect(sql).toContain('Future reservations for affected students')
    expect(sql).toContain('derived_expired_at_candidate')
    expect(sql).toContain('Update template A')
    expect(sql).toContain('-- UPDATE public.student_memberships')
    expect(executableLines.some((line) => /^UPDATE\s+public\./i.test(line))).toBe(false)
    expect(executableLines.some((line) => /^SELECT\s+public\.sync_student_membership_operational_status/i.test(line))).toBe(false)
  })
})
