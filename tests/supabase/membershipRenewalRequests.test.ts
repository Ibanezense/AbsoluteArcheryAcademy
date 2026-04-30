import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_140000_membership_renewal_requests.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

describe('20260430 membership renewal requests migration', () => {
  it('adds renewal request storage and country club prices', () => {
    expect(sql).toContain('ALTER TABLE public.membership_plans')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS country_club_price')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.student_membership_renewal_requests')
    expect(sql).toContain("status IN ('pending_payment', 'pending_validation', 'approved', 'cancelled')")
  })

  it('seeds the requested normal and CCT prices', () => {
    expect(sql).toContain("PERFORM public.upsert_student_renewal_plan('4 clases', 4, 160, 130)")
    expect(sql).toContain("PERFORM public.upsert_student_renewal_plan('8 clases', 8, 240, 170)")
    expect(sql).toContain("PERFORM public.upsert_student_renewal_plan('12 clases', 12, 310, NULL)")
    expect(sql).toContain("PERFORM public.upsert_student_renewal_plan('16 clases', 16, 370, NULL)")
  })

  it('creates student request and admin approval RPCs', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_membership_renewal_options')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.request_membership_renewal')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_approve_membership_renewal_request')
    expect(sql).toContain('public.admin_assign_membership_plan')
    expect(sql).toContain("'membership_renewal_request'")
  })
})
