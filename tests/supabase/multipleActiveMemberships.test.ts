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

function expectNoMembershipStatusGate(functionBody: string, membershipLookup: string) {
  const executableSql = functionBody
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''")
  const lookupPredicate = membershipLookup
    .slice(membershipLookup.search(/\bWHERE\b/i))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''")

  expect(lookupPredicate).not.toMatch(/\bstatus\b/i)
  expect(executableSql).not.toMatch(
    /(?:IF|ELSIF|WHEN|WHERE|AND|OR)\b(?:(?!\bTHEN\b|;)[\s\S]){0,600}?(?:(?:[a-z_][a-z0-9_]*membership[a-z0-9_]*|sm)\.status|\bv_(?:[a-z0-9_]*membership[a-z0-9_]*status|status)\b)(?:(?!\bTHEN\b|;)[\s\S]){0,250}?(?:=|<>|!=|NOT\s+IN\b|IN\b|IS\b|LIKE\b|~)/i,
  )
  expect(executableSql).not.toMatch(
    /(?:WHERE|AND|OR)\s+(?:COALESCE\s*\(|lower\s*\(|upper\s*\(|\(+\s*)*status\b(?:(?!;)[\s\S]){0,250}?(?:=|<>|!=|NOT\s+IN\b|IN\b|IS\b|LIKE\b|~)/i,
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
    expectRestrictedRpc('admin_update_student_membership')
    expectRestrictedRpc('admin_approve_membership_renewal_request')
    expectRestrictedRpc('get_student_dashboard')
    expectRestrictedRpc('get_my_children')
    expectRestrictedRpc('get_student_class_cards')
    expectRestrictedRpc('get_admin_quick_booking_students')
    expectRestrictedRpc('admin_get_membership_deletion_preview')
    expectRestrictedRpc('admin_delete_student_membership')
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

  it('updates only the selected membership without closing active sibling cycles', () => {
    const updateSql = functionSql('admin_update_student_membership')

    expect(updateSql).toContain('RETURNS public.student_memberships')
    expect(updateSql).toContain('WHERE id = p_membership_id')
    expect(updateSql).toContain('RETURNING * INTO v_updated')
    expect(updateSql).toContain('public.sync_student_membership_operational_status(v_membership.student_id)')
    expect(updateSql).not.toMatch(/UPDATE public\.student_memberships[\s\S]*id <> v_membership\.id[\s\S]*status = 'active'/i)
  })

  it('approves a renewal as a separate idempotent paid cycle', () => {
    const approvalSql = functionSql('admin_approve_membership_renewal_request')

    expect(approvalSql).toContain("v_request.status NOT IN ('pending_payment', 'pending_validation')")
    expect(approvalSql).toContain('INSERT INTO public.student_memberships')
    expect(approvalSql).toContain('membership_origin')
    expect(approvalSql).toContain('assignment_batch_id')
    expect(approvalSql).toContain("'paid'")
    expect(approvalSql).toContain('INSERT INTO public.student_credit_ledger')
    expect(approvalSql).toContain('INSERT INTO public.student_membership_payments')
    expect(approvalSql).toContain("status = 'approved'")
    expect(approvalSql).toContain('public.sync_student_membership_operational_status(v_request.student_id)')
    expect(approvalSql).not.toMatch(/UPDATE public\.student_memberships[\s\S]*status = 'historical'/i)
  })

  it('overrides remaining read surfaces with Lima FIFO free balances', () => {
    for (const functionName of [
      'get_student_dashboard',
      'get_my_children',
      'get_student_class_cards',
      'get_admin_quick_booking_students',
    ]) {
      const readSql = functionSql(functionName)

      expect(readSql).toContain("AT TIME ZONE 'America/Lima'")
      expect(readSql).toContain("b.status = 'reserved'")
      expect(readSql).toMatch(/classes_remaining[\s\S]*reserved_count/i)
      expect(readSql).toMatch(/ORDER BY[\s\S]*start_date ASC[\s\S]*created_at ASC[\s\S]*id ASC/i)
      expect(readSql).not.toMatch(/start_date DESC/i)
    }

    expect(functionSql('get_student_dashboard')).toContain('public.resolve_accessible_student_id(p_student_id)')
    expect(functionSql('get_my_children')).toContain('base.operational_status')
    const classCardsSql = functionSql('get_student_class_cards')
    expect(classCardsSql).toContain("'available'")
    expect(classCardsSql).toMatch(/classes_total\s*-\s*LEAST\(sm\.classes_total,\s*COALESCE\(sm\.classes_remaining, 0\)\)[\s\S]*AS used_slots/i)
    expect(classCardsSql).toContain('ON sm.used_slots + reserved.reservation_index = slot.card_index')
    const quickBookingSql = functionSql('get_admin_quick_booking_students')
    expect(quickBookingSql).toContain('WHERE COALESCE(s.is_active, true) = true')
    expect(quickBookingSql).toContain("COALESCE(s.operational_status, 'active') = 'active'")
  })

  it('contains no remaining latest-migration sibling closure or descending membership priority', () => {
    expect(sql).not.toMatch(/UPDATE public\.student_memberships[\s\S]{0,500}status\s*=\s*'historical'/i)
    expect(sql).not.toMatch(/start_date DESC/i)
  })

  it('preserves an expired dashboard fallback without making it consumable', () => {
    const dashboardSql = functionSql('get_student_dashboard')

    expect(dashboardSql).toContain('fallback_membership')
    expect(dashboardSql).toMatch(/status IN \('expired', 'historical'\)/i)
    expect(dashboardSql).toContain("THEN 'scheduled'")
    expect(dashboardSql).toContain("ELSE 'expired'")
    expect(dashboardSql).toContain('COALESCE(sm.custom_name, fallback_membership.custom_name)')
    expect(dashboardSql).toMatch(/WHEN sm\.id IS NOT NULL THEN sm\.available_classes[\s\S]*ELSE 0/i)
    expect(dashboardSql).toContain("fallback_membership.status = 'active'")
    expect(dashboardSql).toContain('fallback_membership.start_date > v_today')
  })

  it('previews corrective deletion dependencies without using membership status as eligibility', () => {
    const previewSql = functionSql('admin_get_membership_deletion_preview')

    expect(previewSql).toContain(
      'CREATE OR REPLACE FUNCTION public.admin_get_membership_deletion_preview',
    )
    expect(previewSql).toMatch(/p_membership_id uuid/i)
    expect(previewSql).toMatch(/RETURNS jsonb/i)
    expect(previewSql).toContain('SECURITY DEFINER')
    expect(previewSql).toContain('SET search_path = public')
    expect(previewSql).toContain('auth.uid()')
    expect(previewSql).toContain('public.is_admin_user()')
    const attendanceBookingCount = previewSql.match(
      /SELECT\s+COUNT\(\*\)[^;]*INTO\s+(v_[a-z0-9_]+)[^;]*FROM public\.bookings[^;]*active_membership_id\s*=\s*p_membership_id[^;]*status\s+IN\s*\('attended',\s*'no_show'\)[^;]*;/i,
    )?.[1] ?? '__missing_attendance_booking_count__'
    const weeklyAttendanceCount = previewSql.match(
      /SELECT\s+COUNT\(\*\)[^;]*INTO\s+(v_[a-z0-9_]+)[^;]*FROM public\.student_weekly_attendance[^;]*student_membership_id\s*=\s*p_membership_id[^;]*;/i,
    )?.[1] ?? '__missing_weekly_attendance_count__'

    expect(attendanceBookingCount).not.toContain('__missing')
    expect(weeklyAttendanceCount).not.toContain('__missing')
    expect(previewSql).toContain("'booking_count'")
    expect(previewSql).toContain("'payment_count'")
    expect(previewSql).toContain("'ledger_count'")
    expect(previewSql).toContain("'weekly_attendance_count'")
    expect(previewSql).toContain("'can_delete'")
    expect(previewSql).toMatch(new RegExp(
      `'can_delete'\\s*,\\s*\\(?\\s*(?:${attendanceBookingCount}\\s*=\\s*0\\s+AND\\s+${weeklyAttendanceCount}\\s*=\\s*0|${weeklyAttendanceCount}\\s*=\\s*0\\s+AND\\s+${attendanceBookingCount}\\s*=\\s*0)\\s*\\)?`,
      'i',
    ))

    const countStatements = [...previewSql.matchAll(
      /SELECT\s+COUNT\(\*\)[^;]*INTO\s+(v_[a-z0-9_]+)[^;]*FROM public\.([a-z0-9_]+)[^;]*;/gi,
    )]
    const bookingCount = countStatements.find((match) => (
      match[2].toLowerCase() === 'bookings'
      && /active_membership_id\s*=\s*p_membership_id/i.test(match[0])
      && !/\bstatus\b/i.test(match[0])
    ))?.[1] ?? '__missing_booking_count__'
    const paymentCount = countStatements.find((match) => (
      match[2].toLowerCase() === 'student_membership_payments'
      && /student_membership_id\s*=\s*p_membership_id/i.test(match[0])
    ))?.[1] ?? '__missing_payment_count__'
    const ledgerCount = countStatements.find((match) => (
      match[2].toLowerCase() === 'student_credit_ledger'
      && /student_membership_id\s*=\s*p_membership_id/i.test(match[0])
    ))?.[1] ?? '__missing_ledger_count__'

    for (const [key, count] of [
      ['booking_count', bookingCount],
      ['payment_count', paymentCount],
      ['ledger_count', ledgerCount],
      ['weekly_attendance_count', weeklyAttendanceCount],
    ]) {
      expect(count).not.toContain('__missing')
      expect(previewSql).toMatch(new RegExp(`'${key}'\\s*,\\s*${count}\\b`, 'i'))
    }

    const membershipLookup = previewSql.match(
      /(?:SELECT|PERFORM)[^;]*FROM public\.student_memberships[^;]*WHERE[^;]*id\s*=\s*p_membership_id[^;]*;/i,
    )?.[0] ?? ''

    expect(membershipLookup).toContain('public.student_memberships')
    expectNoMembershipStatusGate(previewSql, membershipLookup)
  })

  it('deletes every dependency only when no attendance history exists', () => {
    const deleteSql = functionSql('admin_delete_student_membership')

    expect(deleteSql).toContain(
      'CREATE OR REPLACE FUNCTION public.admin_delete_student_membership',
    )
    expect(deleteSql).toMatch(/p_membership_id uuid/i)
    expect(deleteSql).toMatch(/RETURNS jsonb/i)
    expect(deleteSql).toContain('SECURITY DEFINER')
    expect(deleteSql).toContain('SET search_path = public')
    expect(deleteSql).toContain('auth.uid()')
    expect(deleteSql).toContain('public.is_admin_user()')
    expect(deleteSql).toMatch(
      /(?:SELECT|PERFORM)[^;]*FROM public\.student_memberships[^;]*id\s*=\s*p_membership_id[^;]*FOR UPDATE\s*;/i,
    )
    expect(deleteSql).toMatch(
      /(?:SELECT|PERFORM)[^;]*FROM public\.bookings[^;]*active_membership_id\s*=\s*p_membership_id[^;]*FOR UPDATE\s*;/i,
    )
    expect(deleteSql).toMatch(
      /(?:SELECT|PERFORM)[^;]*FROM public\.student_weekly_attendance[^;]*student_membership_id\s*=\s*p_membership_id[^;]*FOR UPDATE\s*;/i,
    )
    const attendanceBookingCount = deleteSql.match(
      /SELECT\s+COUNT\(\*\)[^;]*INTO\s+(v_[a-z0-9_]+)[^;]*FROM public\.bookings[^;]*active_membership_id\s*=\s*p_membership_id[^;]*status\s+IN\s*\('attended',\s*'no_show'\)[^;]*;/i,
    )?.[1] ?? '__missing_attendance_booking_count__'
    const weeklyAttendanceCount = deleteSql.match(
      /SELECT\s+COUNT\(\*\)[^;]*INTO\s+(v_[a-z0-9_]+)[^;]*FROM public\.student_weekly_attendance[^;]*student_membership_id\s*=\s*p_membership_id[^;]*;/i,
    )?.[1] ?? '__missing_weekly_attendance_count__'

    expect(attendanceBookingCount).not.toContain('__missing')
    expect(weeklyAttendanceCount).not.toContain('__missing')
    const membershipLookup = deleteSql.match(
      /(?:SELECT|PERFORM)[^;]*FROM public\.student_memberships[^;]*WHERE[^;]*id\s*=\s*p_membership_id[^;]*FOR UPDATE\s*;/i,
    )?.[0] ?? ''

    expectNoMembershipStatusGate(deleteSql, membershipLookup)

    const bookingDelete = deleteSql.indexOf('DELETE FROM public.bookings')
    const paymentDelete = deleteSql.indexOf(
      'DELETE FROM public.student_membership_payments',
    )
    const ledgerDelete = deleteSql.indexOf(
      'DELETE FROM public.student_credit_ledger',
    )
    const membershipDelete = deleteSql.indexOf(
      'DELETE FROM public.student_memberships',
    )

    expect(bookingDelete).toBeGreaterThan(-1)
    const guardSql = deleteSql.slice(0, bookingDelete)
    expect(guardSql).toMatch(new RegExp(
      `IF(?:(?!END IF;)[\\s\\S])*(?:${attendanceBookingCount}\\s*>\\s*0\\s+OR\\s+${weeklyAttendanceCount}\\s*>\\s*0|${weeklyAttendanceCount}\\s*>\\s*0\\s+OR\\s+${attendanceBookingCount}\\s*>\\s*0)(?:(?!END IF;)[\\s\\S])*THEN(?:(?!END IF;)[\\s\\S])*RAISE EXCEPTION(?:(?!END IF;)[\\s\\S])*END IF;`,
      'i',
    ))
    expect(paymentDelete).toBeGreaterThan(bookingDelete)
    expect(ledgerDelete).toBeGreaterThan(paymentDelete)
    expect(membershipDelete).toBeGreaterThan(ledgerDelete)
    const deletedBookingCount = deleteSql.match(
      /DELETE FROM public\.bookings[^;]*;\s*GET DIAGNOSTICS\s+(v_[a-z0-9_]+)\s*=\s*ROW_COUNT\s*;/i,
    )?.[1] ?? '__missing_deleted_booking_count__'
    const deletedPaymentCount = deleteSql.match(
      /DELETE FROM public\.student_membership_payments[^;]*;\s*GET DIAGNOSTICS\s+(v_[a-z0-9_]+)\s*=\s*ROW_COUNT\s*;/i,
    )?.[1] ?? '__missing_deleted_payment_count__'
    const deletedLedgerCount = deleteSql.match(
      /DELETE FROM public\.student_credit_ledger[^;]*;\s*GET DIAGNOSTICS\s+(v_[a-z0-9_]+)\s*=\s*ROW_COUNT\s*;/i,
    )?.[1] ?? '__missing_deleted_ledger_count__'
    const deletedMembershipCount = deleteSql.match(
      /DELETE FROM public\.student_memberships[^;]*;\s*GET DIAGNOSTICS\s+(v_[a-z0-9_]+)\s*=\s*ROW_COUNT\s*;/i,
    )?.[1] ?? '__missing_deleted_membership_count__'

    for (const count of [deletedBookingCount, deletedPaymentCount, deletedLedgerCount, deletedMembershipCount]) {
      expect(count).not.toContain('__missing')
    }
    for (const [key, count] of [
      ['booking_count', deletedBookingCount],
      ['payment_count', deletedPaymentCount],
      ['ledger_count', deletedLedgerCount],
      ['membership_count', deletedMembershipCount],
    ]) {
      expect(deleteSql).toMatch(new RegExp(`'${key}'\\s*,\\s*${count}\\b`, 'i'))
    }
    expect(deleteSql).toContain(
      'public.sync_student_membership_operational_status(v_membership.student_id)',
    )
    expect(deleteSql).toMatch(/EXCEPTION\s+WHEN OTHERS THEN/i)
    expect(deleteSql).toMatch(
      /jsonb_build_object\([\s\S]*'success'\s*,\s*false[\s\S]*'membership_id'\s*,\s*p_membership_id[\s\S]*'error'\s*,\s*SQLERRM[\s\S]*\)/i,
    )
  })
})
