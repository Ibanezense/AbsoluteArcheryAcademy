import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260716_090100_harden_student_membership_operations.sql'
)

describe('student membership operation RPC security', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('revokes anonymous execution from both privileged operations', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_assign_membership_from_profile\([\s\S]*?\) FROM anon;/)
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_manage_student_membership(uuid, text, jsonb) FROM anon;'
    )
  })
})
