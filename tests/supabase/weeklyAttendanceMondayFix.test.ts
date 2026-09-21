import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_fix_weekly_attendance_monday_review.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_weekly_attendance_monday_fix.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

function functionSql(signature: string, nextMarker: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${signature}`)
  const end = sql.indexOf(nextMarker, start)
  return start >= 0 ? sql.slice(start, end >= 0 ? end : undefined) : ''
}

describe('weekly attendance Monday-to-Sunday repair', () => {
  it('repairs legacy Thursday week starts without changing their Sunday', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS student_weekly_attendance_valid_window[\s\S]*CHECK \(week_end = week_start \+ 6\)/i,
    )
    expect(sql).toMatch(
      /UPDATE public\.student_weekly_attendance[\s\S]*week_start\s*=\s*week_end\s*-\s*6[\s\S]*week_start\s*=\s*week_end\s*-\s*3/i,
    )
  })

  it('uses the same Monday-to-Sunday window when reviewing and marking', () => {
    const review = functionSql(
      'get_weekly_attendance_review',
      'REVOKE ALL ON FUNCTION public.get_weekly_attendance_review',
    )
    const mark = functionSql(
      'admin_mark_weekly_no_show',
      'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show',
    )

    expect(review).toContain('v_week_start := p_sunday - 6')
    expect(mark).toContain('v_week_start := p_sunday - 6')
    expect(review).not.toContain('v_week_start := p_sunday - 3')
    expect(mark).not.toContain('v_week_start := p_sunday - 3')
  })

  it('neutralizes academy cancellations instead of creating an absence debt', () => {
    const review = functionSql(
      'get_weekly_attendance_review',
      'REVOKE ALL ON FUNCTION public.get_weekly_attendance_review',
    )
    const mark = functionSql(
      'admin_mark_weekly_no_show',
      'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show',
    )

    for (const body of [review, mark]) {
      expect(body).toContain("cancellation.cancellation_source IN ('academy', 'membership_freeze')")
      expect(body).toContain('neutralized_cancellation_count')
    }
  })

  it('restores weekly targets for the Country affiliate plans and memberships', () => {
    expect(sql).toMatch(/1 clase por semana - afiliados country[\s\S]*THEN 1/i)
    expect(sql).toMatch(/2 clases por semana - afiliados country[\s\S]*THEN 2/i)
    expect(sql).toMatch(
      /UPDATE public\.student_memberships[\s\S]*weekly_class_target\s*=\s*plan\.weekly_class_target[\s\S]*membership_plan_id\s*=\s*plan\.id/i,
    )
  })
})
