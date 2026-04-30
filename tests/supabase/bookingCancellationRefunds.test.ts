import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_110000_fix_booking_cancellation_refunds.sql',
)

describe('20260430 booking cancellation refunds migration', () => {
  it('allows cancelling unfinished classes and refunds the booking membership by session date', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.cancel_booking')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_cancel_booking')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_cancel_session')
    expect(sql).toContain('IF v_session.end_at <= now() THEN')
    expect(sql).not.toContain("interval '4 hours'")
    expect(sql).toContain('v_session_date')
    expect(sql).toContain('v_membership.start_date <= v_session_date')
    expect(sql).toContain('(v_membership.end_date IS NULL OR v_membership.end_date >= v_session_date)')
    expect(sql).toContain('classes_used = GREATEST(classes_used - 1, 0)')
    expect(sql).toContain('classes_remaining = classes_remaining + 1')
    expect(sql).toContain('booking_cancelled_refund')
  })
})
