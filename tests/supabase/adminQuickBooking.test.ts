import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_120000_admin_quick_booking_helpers.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

describe('20260430 admin quick booking helpers migration', () => {
  it('adds admin-only RPCs for students and session availability', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_admin_quick_booking_students')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_admin_available_sessions_for_student')
    expect(sql).toContain('IF NOT public.is_admin_user() THEN')
    expect(sql).toContain("GREATEST(p_date_from, v_min_date)")
    expect(sql).toContain("v_min_date := (now() AT TIME ZONE 'America/Lima')::date - 7")
    expect(sql).toContain("dc.status <> 'scheduled'")
    expect(sql).not.toContain('dc.start_at <= now() THEN 0')
  })

  it('returns all active students without requiring a current positive class balance', () => {
    expect(sql).toContain('WHERE COALESCE(s.is_active, true) = true')
    expect(sql).toContain("WHEN current_membership.id IS NULL THEN 'no_membership'")
    expect(sql).toContain("WHEN COALESCE(current_membership.classes_remaining, 0) <= 0 THEN 'no_classes'")
  })
})
