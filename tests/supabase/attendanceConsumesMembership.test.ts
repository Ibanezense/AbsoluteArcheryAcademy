import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_130000_consume_membership_on_attendance.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

function functionSql(functionName: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  const end = sql.indexOf('GRANT EXECUTE ON FUNCTION', start)
  return sql.slice(start, end)
}

describe('20260430 attendance consumes membership credits migration', () => {
  it('stops consuming membership credits when bookings are created', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.book_session')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_book_session')
    expect(sql).toContain('v_pending_reserved_count')
    expect(sql).toContain("b.status = 'reserved'")
    expect(sql).toContain('v_pending_reserved_count >= COALESCE(v_membership.classes_remaining, 0)')
    expect(sql).not.toContain("booking_reserved',\n    -1")
    expect(sql).not.toContain('classes_used = classes_used + 1,\n    classes_remaining = classes_remaining - 1')
  })

  it('consumes one class only when attendance or no-show is marked from a reserved booking', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_mark_attendance')
    expect(sql).toContain("IF v_booking.status = 'reserved'")
    expect(sql).toContain('classes_used = classes_used + 1')
    expect(sql).toContain('classes_remaining = GREATEST(classes_remaining - 1, 0)')
    expect(sql).toContain("'attendance_consumed'")
  })

  it('does not refund pending reservation cancellations because reservation no longer consumes credit', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.cancel_booking')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_cancel_booking')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_cancel_session')

    expect(functionSql('cancel_booking')).not.toContain("'booking_cancelled_refund'")
    expect(functionSql('admin_cancel_booking')).not.toContain("'booking_cancelled_refund'")
    expect(functionSql('admin_cancel_session')).not.toContain("'booking_cancelled_refund'")
    expect(sql).toContain("'booking_cancelled_no_refund'")
  })

  it('restores credits for existing pending reservations that were already charged by old booking RPCs', () => {
    expect(sql).toContain("'booking_reservation_released'")
    expect(sql).toContain("b.status = 'reserved'")
    expect(sql).toContain("old_charge.movement_type = 'booking_reserved'")
    expect(sql).toContain("already_released.movement_type = 'booking_reservation_released'")
  })
})
