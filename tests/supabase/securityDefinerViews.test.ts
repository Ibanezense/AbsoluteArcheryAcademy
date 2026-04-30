import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_190000_fix_security_definer_views.sql'
)

describe('security definer views advisor migration', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  const views = [
    'dashboard_kpis',
    'session_distance_availability',
    'session_details',
    'sessions_with_availability',
    'admin_roster_by_distance',
    'admin_students_view',
    'admin_bookings_view',
    'weekly_schedule',
  ]

  it('marks each advisor-reported view as security invoker defensively', () => {
    for (const view of views) {
      expect(sql).toContain(`ALTER VIEW IF EXISTS public.${view} SET (security_invoker = true);`)
    }
  })
})
