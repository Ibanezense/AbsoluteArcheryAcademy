import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260801_190000_multiple_active_student_memberships.sql',
)

const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

function functionSql(functionName: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`
  const start = sql.indexOf(marker)

  if (start === -1) return ''

  const remainingSql = sql.slice(start + marker.length)
  const nextFunctionOffset = remainingSql.search(
    /\n\s*CREATE OR REPLACE FUNCTION public\./,
  )

  return nextFunctionOffset === -1
    ? sql.slice(start)
    : sql.slice(start, start + marker.length + nextFunctionOffset)
}

function expectRestrictedRpc(functionName: string) {
  const grantPattern = new RegExp(
    `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${functionName}\\([^;]*?\\)\\s+TO\\s+([^;]+);`,
    'gi',
  )
  const grantedRoles = [...sql.matchAll(grantPattern)].flatMap((match) =>
    match[1]
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean),
  )

  expect(sql).toMatch(
    new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?\\) FROM PUBLIC;`,
    ),
  )
  expect(sql).toMatch(
    new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?\\) FROM anon;`,
    ),
  )
  expect(new Set(grantedRoles)).toEqual(
    new Set(['authenticated', 'service_role']),
  )
}

describe('multiple active student memberships migration', () => {
  it('allows separate paid and gift membership rows without replacing active siblings', () => {
    expect(existsSync(migrationPath)).toBe(true)
    expect(sql).toContain(
      'DROP INDEX IF EXISTS public.idx_student_memberships_one_active',
    )
    expect(sql).toContain("membership_origin IN ('paid', 'gift')")
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.admin_create_student_membership_cycles',
    )
    expect(functionSql('admin_assign_membership_plan')).not.toMatch(
      /UPDATE\s+public\.student_memberships(?:\s+(?:AS\s+)?[a-z_][a-z0-9_]*)?[\s\S]*?\bstatus\s*=\s*'historical'/i,
    )
  })

  it('selects the oldest eligible membership after subtracting its reserved bookings', () => {
    const selectorSql = functionSql('select_student_membership_for_date')

    expect(selectorSql).toContain(
      'CREATE OR REPLACE FUNCTION public.select_student_membership_for_date',
    )
    expect(selectorSql).toMatch(/sm\.student_id\s*=\s*p_student_id/i)
    expect(selectorSql).toMatch(/sm\.status\s*=\s*'active'/i)
    expect(selectorSql).toMatch(/sm\.start_date\s*<=\s*p_service_date/i)
    expect(selectorSql).toMatch(
      /\(sm\.end_date\s+IS\s+NULL\s+OR\s+sm\.end_date\s*>=\s*p_service_date\)/i,
    )
    expect(selectorSql).toMatch(
      /sm\.classes_remaining\s*>\s*\([\s\S]*COUNT\(\*\)[\s\S]*FROM public\.bookings b[\s\S]*b\.active_membership_id = sm\.id[\s\S]*b\.status = 'reserved'[\s\S]*\)/i,
    )
    expect(selectorSql).toMatch(
      /ORDER BY[\s\S]*sm\.start_date ASC[\s\S]*sm\.created_at ASC[\s\S]*sm\.id ASC/,
    )
  })

  it('routes student and admin reservations through the shared membership selector', () => {
    const bookSessionSql = functionSql('book_session')
    const adminBookSessionSql = functionSql('admin_book_session')

    expect(bookSessionSql).toContain('public.select_student_membership_for_date')
    expect(adminBookSessionSql).toContain(
      'public.select_student_membership_for_date',
    )
  })

  it('uses and locks the oldest eligible membership for a weekly no-show', () => {
    const weeklyNoShowSql = functionSql('admin_mark_weekly_no_show')

    expect(weeklyNoShowSql).toContain('FOR UPDATE')
    expect(weeklyNoShowSql).toMatch(
      /ORDER BY[\s\S]*sm\.start_date ASC[\s\S]*sm\.created_at ASC[\s\S]*sm\.id ASC/,
    )
  })

  it('restricts membership selection and privileged membership RPCs', () => {
    expectRestrictedRpc('select_student_membership_for_date')
    expectRestrictedRpc('admin_assign_membership_plan')
    expectRestrictedRpc('admin_create_student_membership_cycles')
    expectRestrictedRpc('book_session')
    expectRestrictedRpc('admin_book_session')
    expectRestrictedRpc('admin_mark_weekly_no_show')
  })
})
