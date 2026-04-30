import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_170000_include_next_booking_end_at.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

describe('20260430 next booking cancellation fields migration', () => {
  it('includes end_at and status in get_my_next_booking', () => {
    expect(sql).toContain("'end_at', s.end_at")
    expect(sql).toContain("'status', b.status")
    expect(sql).toContain('AND s.end_at >= now()')
  })
})
