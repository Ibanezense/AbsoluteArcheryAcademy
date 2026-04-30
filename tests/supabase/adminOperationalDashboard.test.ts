import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_180000_admin_operational_dashboard.sql'
)

describe('admin operational dashboard migration', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('creates a single operational dashboard rpc using V2 academic entities', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_admin_dashboard_operational_data()')
    expect(sql).toContain('RETURNS json')
    expect(sql).toContain('FROM public.students')
    expect(sql).toContain('public.student_memberships')
    expect(sql).toContain('public.student_membership_payments')
    expect(sql).toContain('public.bookings')
    expect(sql).toContain('public.sessions')
    expect(sql).toContain('public.admin_roster_by_distance')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_operational_data() TO authenticated')
  })

  it('adds a bounded admin student search rpc for the compact dashboard header', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_search_students(')
    expect(sql).toContain('p_limit integer DEFAULT 8')
    expect(sql).toContain('LIMIT LEAST(GREATEST(p_limit, 1), 20)')
  })

  it('does not query non-existent booking_status enum values', () => {
    expect(sql).not.toMatch(/b\.status\s+IN\s+\([^)]*'confirmed'/)
    expect(sql).not.toContain("b.status = 'confirmed'")
  })
})
