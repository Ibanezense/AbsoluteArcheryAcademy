import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260605_090000_admin_attendance_intro_rows.sql'
)

describe('admin attendance daily roster intro migration', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('extends get_daily_roster to include intro bookings in the same operational roster', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_daily_roster(p_date date)')
    expect(sql).toContain('entry_type text')
    expect(sql).toContain('intro_client_id uuid')
    expect(sql).toContain('LEFT JOIN public.students st')
    expect(sql).toContain('LEFT JOIN public.intro_clients ic')
    expect(sql).toContain("CASE WHEN b.intro_client_id IS NOT NULL THEN 'intro' ELSE 'student' END AS entry_type")
    expect(sql).toContain("COALESCE(st.full_name, ic.full_name, 'Sin nombre') AS student_name")
    expect(sql).toContain("AND b.status IN ('reserved', 'attended', 'no_show')")
  })
})
