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

  it('locks and revalidates FIFO membership free balance before either booking insert', () => {
    for (const functionName of ['book_session', 'admin_book_session']) {
      const bookingSql = functionSql(functionName)

      expect(bookingSql).toMatch(
        /select_student_membership_for_date[\s\S]*FROM public\.student_memberships sm[\s\S]*sm\.id\s*=\s*v_membership\.id[\s\S]*FOR UPDATE/i,
      )
      expect(bookingSql).toMatch(
        /COUNT\(\*\)[\s\S]*b\.active_membership_id\s*=\s*v_membership\.id[\s\S]*b\.status\s*=\s*'reserved'/i,
      )
      expect(bookingSql).toMatch(
        /v_pending_reserved_count\s*<\s*COALESCE\(v_membership\.classes_remaining,\s*0\)/i,
      )
    }
  })

  it('uses and locks the oldest eligible membership for a weekly no-show', () => {
    const weeklyNoShowSql = functionSql('admin_mark_weekly_no_show')

    expect(weeklyNoShowSql).toContain(
      'public.select_student_membership_for_date',
    )
    expect(weeklyNoShowSql).toContain('FOR UPDATE')
    expect(weeklyNoShowSql).toMatch(
      /COUNT\(\*\)[\s\S]*reserved_booking\.active_membership_id\s*=\s*v_membership\.id[\s\S]*reserved_booking\.status\s*=\s*'reserved'/i,
    )
  })

  it('returns each weekly candidate once through one FIFO lateral membership', () => {
    const reviewSql = functionSql('get_weekly_attendance_review')

    expect(reviewSql).toContain('public.select_student_membership_for_date')
    expect(reviewSql).toMatch(/JOIN LATERAL[\s\S]*select_student_membership_for_date/i)
    expect(reviewSql).not.toMatch(
      /INNER JOIN public\.student_memberships\s+sm\s+ON\s+sm\.student_id\s*=\s*st\.id/i,
    )
  })

  it('treats total amount per cycle and distributes one batch payment without duplication', () => {
    const bulkSql = functionSql('admin_create_student_membership_cycles')

    expect(bulkSql).toContain('p_total_amount is the price of each cycle')
    expect(bulkSql).toContain('p_payment_amount is the payment for the whole batch')
    expect(bulkSql).toMatch(/ROUND\([\s\S]*v_batch_payment_amount[\s\S]*v_period_count[\s\S]*2\)/i)
    expect(bulkSql).toMatch(
      /WHEN v_period = v_period_count[\s\S]*v_batch_payment_amount\s*-\s*v_distributed_payment/i,
    )
    expect(bulkSql).toMatch(
      /v_distributed_payment\s*:=\s*v_distributed_payment\s*\+\s*v_payment_amount/i,
    )
  })

  it('syncs by Lima eligibility and never directly reactivates protected or future students', () => {
    const syncSql = functionSql('sync_student_membership_operational_status')
    const assignmentSql = functionSql('admin_assign_membership_plan')
    const bulkSql = functionSql('admin_create_student_membership_cycles')

    expect(syncSql).toContain("now() AT TIME ZONE 'America/Lima'")
    expect(syncSql).toMatch(/active_sm\.start_date\s*<=\s*v_today/i)
    expect(syncSql).toContain('public.is_student_protected_operational_status')
    expect(assignmentSql).toContain(
      'PERFORM public.sync_student_membership_operational_status(p_student_id)',
    )
    expect(bulkSql).toContain(
      'PERFORM public.sync_student_membership_operational_status(p_student_id)',
    )
    expect(assignmentSql).not.toMatch(
      /UPDATE public\.students[\s\S]*operational_status\s*=\s*'active'/i,
    )
    expect(bulkSql).not.toMatch(
      /UPDATE public\.students[\s\S]*operational_status\s*=\s*'active'/i,
    )
  })

  it('restricts membership selection and privileged membership RPCs', () => {
    expectRestrictedRpc('select_student_membership_for_date')
    expectRestrictedRpc('admin_assign_membership_plan')
    expectRestrictedRpc('admin_create_student_membership_cycles')
    expectRestrictedRpc('book_session')
    expectRestrictedRpc('admin_book_session')
    expectRestrictedRpc('get_weekly_attendance_review')
    expectRestrictedRpc('admin_mark_weekly_no_show')
    expectRestrictedRpc('get_admin_membership_reservation_commitments')
  })

  it('aggregates unresolved reservation commitments in one secure admin RPC', () => {
    const commitmentsSql = functionSql('get_admin_membership_reservation_commitments')

    expect(commitmentsSql).toMatch(/p_student_id uuid DEFAULT NULL/i)
    expect(commitmentsSql).toMatch(/RETURNS jsonb/i)
    expect(commitmentsSql).not.toMatch(/RETURNS TABLE/i)
    expect(commitmentsSql).toContain('SECURITY DEFINER')
    expect(commitmentsSql).toContain('SET search_path = public')
    expect(commitmentsSql).toContain('auth.uid()')
    expect(commitmentsSql).toContain('public.is_admin_user()')
    expect(commitmentsSql).toMatch(/COALESCE\(\s*\(auth\.jwt\(\) ->> 'role'\) = 'service_role',\s*false\s*\)/i)
    expect(commitmentsSql).not.toContain('auth.role()')
    expect(commitmentsSql).toContain('public.can_access_student(p_student_id)')
    expect(commitmentsSql).toMatch(/jsonb_object_agg[\s\S]*active_membership_id[\s\S]*reserved_count/i)
    expect(commitmentsSql).toMatch(/COALESCE\([\s\S]*'\{\}'::jsonb/i)
    expect(commitmentsSql).toMatch(/p_student_id IS NULL[\s\S]*public\.is_admin_user\(\)/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_bookings_reserved_membership_commitments[\s\S]*ON public\.bookings\s*\(active_membership_id\)[\s\S]*WHERE status = 'reserved'[\s\S]*active_membership_id IS NOT NULL/i)
  })

  it('cancels a session without writing a column absent from the sessions schema', () => {
    const cancelSessionSql = functionSql('admin_cancel_session')

    expect(cancelSessionSql).toContain('UPDATE public.sessions')
    expect(cancelSessionSql).not.toMatch(/UPDATE public\.sessions[\s\S]*updated_at\s*=/i)
  })
})
