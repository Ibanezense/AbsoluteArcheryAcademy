import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function migration(path: string) {
  return readFileSync(join(process.cwd(), 'supabase/migrations', path), 'utf8')
}

describe('admin expired membership deletion migration', () => {
  it('allows purging closed memberships while blocking active current memberships', () => {
    const sql = migration('20260608_130000_restrict_admin_membership_delete_to_expired.sql')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_delete_student_membership')
    expect(sql).toContain('v_today date := (now() AT TIME ZONE')
    expect(sql).toContain("v_membership.status IN ('expired', 'historical', 'cancelled', 'consumed')")
    expect(sql).toContain('v_membership.status = \'active\'')
    expect(sql).toContain('v_membership.end_date < v_today')
    expect(sql).toContain('IF NOT v_is_deletable THEN')
    expect(sql).toContain('Solo se puede eliminar una membresia vencida, historica, cancelada o consumida')
    expect(sql).not.toContain('DELETE FROM public.bookings')
    expect(sql).toContain('DELETE FROM public.student_membership_payments')
    expect(sql).toContain('DELETE FROM public.student_credit_ledger')
    expect(sql).toContain('DELETE FROM public.student_memberships')
  })
})
