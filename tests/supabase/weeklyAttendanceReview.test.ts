import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260801133039_weekly_attendance_review.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const fifoMigrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260801_190000_multiple_active_student_memberships.sql',
)
const fifoSql = readFileSync(fifoMigrationPath, 'utf8')

function functionSql(functionName: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  const end = sql.indexOf('REVOKE ALL ON FUNCTION', start)
  return sql.slice(start, end)
}

function fifoFunctionSql(functionName: string) {
  const start = fifoSql.indexOf(
    `CREATE OR REPLACE FUNCTION public.${functionName}`,
  )
  const remainingSql = fifoSql.slice(start + 1)
  const nextFunctionOffset = remainingSql.search(
    /\n\s*CREATE OR REPLACE FUNCTION public\./,
  )
  return nextFunctionOffset === -1
    ? fifoSql.slice(start)
    : fifoSql.slice(start, start + 1 + nextFunctionOffset)
}

describe('weekly attendance review migration', () => {
  it('creates an auditable and idempotent weekly no-show record', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.student_weekly_attendance')
    expect(sql).toContain('UNIQUE (student_id, week_start)')
    expect(sql).toContain("CHECK (status = 'no_show')")
    expect(sql).toContain('weekly_attendance_id uuid')
    expect(sql).toContain("'weekly_no_show_consumed'")
    expect(sql).toContain('ON CONFLICT (student_id, week_start) DO NOTHING')
  })

  it('reviews only Sunday windows and excludes attended students', () => {
    const reviewSql = functionSql('get_weekly_attendance_review')

    expect(reviewSql).toContain('EXTRACT(DOW FROM p_sunday) <> 0')
    expect(reviewSql).toContain("AT TIME ZONE 'America/Lima'")
    expect(reviewSql).toContain("p_sunday > (now() AT TIME ZONE 'America/Lima')::date")
    expect(reviewSql).toContain("b.status = 'attended'")
    expect(reviewSql).toContain("pending_booking.status = 'reserved'")
    expect(reviewSql).toContain('pending_booking.student_id IS NOT NULL')
    expect(reviewSql).toContain("sm.status = 'active'")
    expect(reviewSql).toContain('sm.classes_remaining > 0')
    expect(reviewSql).toContain('sm.end_date >= p_sunday')
    expect(reviewSql).toContain("'retired', 'withdrawn', 'blocked', 'suspended'")
  })

  it('marks weekly no-shows atomically and only once', () => {
    const markSql = functionSql('admin_mark_weekly_no_show')

    expect(markSql).toContain('FOR UPDATE')
    expect(markSql).toContain("p_sunday > (now() AT TIME ZONE 'America/Lima')::date")
    expect(markSql).toContain("attendance_booking.status = 'attended'")
    expect(markSql).toContain("pending_booking.status = 'reserved'")
    expect(markSql).toContain('pending_booking.student_id IS NOT NULL')
    expect(markSql).toContain('classes_used = classes_used + 1')
    expect(markSql).toContain('classes_remaining = classes_remaining - 1')
    expect(markSql).toContain("'weekly_no_show_consumed'")
  })

  it('uses one FIFO candidate per student and preserves reserved commitments', () => {
    const reviewSql = fifoFunctionSql('get_weekly_attendance_review')
    const markSql = fifoFunctionSql('admin_mark_weekly_no_show')

    expect(reviewSql).toMatch(/JOIN LATERAL[\s\S]*select_student_membership_for_date/i)
    expect(reviewSql).not.toContain('INNER JOIN public.student_memberships sm')
    expect(markSql).toContain('public.select_student_membership_for_date')
    expect(markSql).toMatch(
      /reserved_booking\.active_membership_id\s*=\s*v_membership\.id[\s\S]*reserved_booking\.status\s*=\s*'reserved'/i,
    )
  })

  it('protects privileged RPCs from anonymous execution', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM PUBLIC;',
    )
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) FROM anon;',
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.admin_mark_weekly_no_show(uuid, date) TO authenticated, service_role;',
    )
  })
})
