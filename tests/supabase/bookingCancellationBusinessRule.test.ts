import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260601_130000_booking_cancellation_business_rule.sql',
)
const multipleMembershipsPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260801_190000_multiple_active_student_memberships.sql',
)

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

function functionSql(sql: string, functionName: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('GRANT EXECUTE ON FUNCTION', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('20260601 booking cancellation business rule migration', () => {
  it('removes direct student booking update policies so cancellation metadata cannot be forged from the client', () => {
    const sql = migrationSql()

    expect(sql).toContain('DROP POLICY IF EXISTS "User can cancel own booking" ON public.bookings')
    expect(sql).toContain('DROP POLICY IF EXISTS "User can cancel own booking via student" ON public.bookings')
    expect(sql.indexOf('DROP POLICY IF EXISTS "User can cancel own booking" ON public.bookings')).toBeLessThan(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.cancel_booking'),
    )
  })

  it('lets students and guardians cancel until class start inclusive, not until class end', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'cancel_booking')

    expect(rpc).toContain('v_session.start_at < now()')
    expect(rpc).not.toContain('v_session.end_at <= now()')
    expect(rpc).not.toContain("interval '4 hours'")
    expect(rpc).toContain("'booking_cancelled_no_refund'")
    expect(rpc).not.toContain("'booking_cancelled_refund'")
  })

  it('keeps student cancellation idempotent and records student or guardian cancellation role', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'cancel_booking')

    expect(rpc).toContain("IF v_booking.status = 'cancelled' THEN")
    expect(rpc).toContain('cancelled_by_role = CASE')
    expect(rpc).toContain("WHEN v_actor_role = 'guardian' THEN 'guardian'")
    expect(rpc).toContain("ELSE 'student'")
  })

  it('lets admin cancel any booking state and refunds exactly one consumed attendance credit', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_cancel_booking')

    expect(rpc).toContain("IF v_booking.status = 'cancelled' THEN")
    expect(rpc).toContain("movement_type = 'attendance_consumed'")
    expect(rpc).toContain("movement_type = 'booking_cancelled_refund'")
    expect(rpc).toContain('NOT EXISTS')
    expect(rpc).toContain('classes_used = GREATEST(classes_used - 1, 0)')
    expect(rpc).toContain('classes_remaining = classes_remaining + 1')
    expect(rpc).toContain("cancelled_by_role = 'admin'")
  })

  it('blocks attendance on cancelled bookings and prevents double attendance consumption', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_mark_attendance')

    expect(rpc).toContain("IF v_booking.status = 'cancelled' THEN")
    expect(rpc).toContain("movement_type = 'attendance_consumed'")
    expect(rpc).toContain('NOT EXISTS')
    expect(rpc).toContain('v_booking.status = v_new_status')
  })

  it('updates full session cancellation with the same admin refund rule', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_cancel_session')

    expect(rpc).toContain("status IN ('reserved', 'attended', 'no_show')")
    expect(rpc).toContain("movement_type = 'attendance_consumed'")
    expect(rpc).toContain("movement_type = 'booking_cancelled_refund'")
    expect(rpc).toContain('NOT EXISTS')
    expect(rpc).toContain("cancelled_by_role = 'admin'")
  })
})

describe('multiple membership refund restoration', () => {
  it('reactivates only a still-valid linked cycle closed because its balance reached zero', () => {
    const sql = readFileSync(multipleMembershipsPath, 'utf8')

    for (const functionName of ['admin_cancel_booking', 'admin_cancel_session']) {
      const rpc = functionSql(sql, functionName)

      expect(rpc).toContain('WHERE id = v_booking.active_membership_id')
      expect(rpc).toMatch(
        /status\s*=\s*CASE[\s\S]*status IN \('expired', 'consumed'\)[\s\S]*expiration_reason = 'no_classes_remaining'[\s\S]*end_date >= \(now\(\) AT TIME ZONE 'America\/Lima'\)::date[\s\S]*THEN 'active'[\s\S]*ELSE status/i,
      )
      expect(rpc).toMatch(
        /expired_at\s*=\s*CASE[\s\S]*THEN NULL[\s\S]*ELSE expired_at/i,
      )
      expect(rpc).toMatch(
        /expiration_reason\s*=\s*CASE[\s\S]*THEN NULL[\s\S]*ELSE expiration_reason/i,
      )
      expect(rpc).toContain(
        'PERFORM public.sync_student_membership_operational_status(v_booking.student_id)',
      )
      expect(rpc).toContain(
        'scl.student_membership_id = v_booking.active_membership_id',
      )
    }
  })
})
