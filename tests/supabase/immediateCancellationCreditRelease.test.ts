import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260927130207_release_credit_on_every_booking_cancellation.sql',
)

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

function functionSql(sql: string, functionName: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end + 4)
}

describe('immediate cancellation credit release', () => {
  it('records student cancellations as final and releases their booking commitment', () => {
    const sql = migrationSql()
    const cancellation = functionSql(sql, 'cancel_booking')

    expect(cancellation).toContain("'student', 'resolved', 'justified'")
    expect(cancellation).toContain("release_booking_resources(v_booking.id, 'student')")
    expect(cancellation).not.toContain("'student', 'pending'")
  })

  it('removes student cancellations from the Sunday review without turning them into absences', () => {
    const sql = migrationSql()
    const cancellation = functionSql(sql, 'cancel_booking')

    expect(cancellation).toContain('review_status,')
    expect(cancellation).toContain('resolution,')
    expect(cancellation).toContain("'resolved', 'justified'")
    expect(cancellation).not.toContain("status = 'no_show'")
    expect(cancellation).not.toContain("'attendance_consumed'")
  })

  it('normalizes existing pending student cancellations as final non-debiting cancellations', () => {
    const sql = migrationSql()

    expect(sql).toMatch(/UPDATE public\.booking_cancellations[\s\S]*review_status = 'resolved'/)
    expect(sql).toMatch(/UPDATE public\.booking_cancellations[\s\S]*resolution = 'justified'/)
    expect(sql).toMatch(/WHERE cancellation_source = 'student'[\s\S]*review_status = 'pending'/)
  })
})
