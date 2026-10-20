import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
describe('progress SQL contract', () => {
  it('provides atomic guarded links and fresh authorization context', () => {
    const sql = readFileSync(
      'supabase/migrations/20261020033416_student_progress_links.sql',
      'utf8'
    )
    for (const part of [
      'student_progress_context',
      'admin_confirm_progress_link',
      'admin_revoke_progress_link',
      'ENABLE ROW LEVEL SECURITY',
      'pg_advisory_xact_lock',
      'expected_revision',
      'student_progress_link_audit',
      'resolve_accessible_student_id',
    ])
      expect(sql).toContain(part)
  })
})
