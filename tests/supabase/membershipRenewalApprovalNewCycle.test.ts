import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_160000_fix_membership_renewal_approval_new_cycle.sql'
)

describe('20260430 membership renewal approval new cycle migration', () => {
  it('replaces approval RPC with explicit new membership cycle behavior', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')
    const approvalFunction = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_approve_membership_renewal_request'))

    expect(approvalFunction).toContain("status = 'historical'")
    expect(approvalFunction).toContain('INSERT INTO public.student_memberships')
    expect(approvalFunction).toContain('v_request.classes_included')
    expect(approvalFunction).toContain('INSERT INTO public.student_credit_ledger')
    expect(approvalFunction).toContain('INSERT INTO public.student_membership_payments')
    expect(approvalFunction).not.toContain('public.admin_assign_membership_plan')
  })
})
