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
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  const end = sql.indexOf('REVOKE ALL ON FUNCTION', start)

  return start === -1 ? '' : sql.slice(start, end === -1 ? undefined : end)
}

function expectRestrictedRpc(functionName: string) {
  const grantPattern = new RegExp(
    `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([\\s\\S]*?\\) TO ([^;]+);`,
    'g',
  )
  const grantedRoles = [...sql.matchAll(grantPattern)].map((match) =>
    match[1].trim(),
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
  expect(sql).toMatch(
    new RegExp(
      `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([\\s\\S]*?\\) TO authenticated, service_role;`,
    ),
  )
  expect(grantedRoles).toEqual(['authenticated, service_role'])
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
    expect(sql).not.toMatch(
      /UPDATE public\.student_memberships[\s\S]*status = 'historical'[\s\S]*WHERE student_id = p_student_id/,
    )
  })

  it('selects the oldest eligible membership after subtracting its reserved bookings', () => {
    const selectorSql = functionSql('select_student_membership_for_date')

    expect(selectorSql).toContain(
      'CREATE OR REPLACE FUNCTION public.select_student_membership_for_date',
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
