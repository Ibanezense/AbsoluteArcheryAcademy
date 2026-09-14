import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_weekly_attendance_quota.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_weekly_attendance_quota.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
const transactionalTestPath = join(
  process.cwd(),
  'supabase',
  'tests',
  'weekly_attendance_quota_transactional.sql',
)
const transactionalTestSql = existsSync(transactionalTestPath)
  ? readFileSync(transactionalTestPath, 'utf8')
  : ''
const planClassificationStart = sql.indexOf('UPDATE public.membership_plans')
const membershipBackfillStart = sql.indexOf(
  'UPDATE public.student_memberships',
  planClassificationStart,
)
const planClassificationSql = sql.slice(
  planClassificationStart,
  membershipBackfillStart,
)
const triggerFunctionStart = sql.indexOf(
  'CREATE OR REPLACE FUNCTION public.set_student_membership_weekly_class_target()',
)
const triggerFunctionEnd = sql.indexOf(
  'DROP TRIGGER IF EXISTS set_student_membership_weekly_class_target',
  triggerFunctionStart,
)
const triggerFunctionSql = sql.slice(triggerFunctionStart, triggerFunctionEnd)
const reviewFunctionStart = sql.indexOf(
  'CREATE OR REPLACE FUNCTION public.get_weekly_attendance_review',
)
const reviewFunctionEnd = sql.indexOf(
  'REVOKE ALL ON FUNCTION public.get_weekly_attendance_review',
  reviewFunctionStart,
)
const reviewFunctionSql = sql.slice(reviewFunctionStart, reviewFunctionEnd)
const markFunctionStart = sql.indexOf(
  'CREATE OR REPLACE FUNCTION public.admin_mark_weekly_no_show',
)
const markFunctionEnd = sql.indexOf(
  'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show',
  markFunctionStart,
)
const markFunctionSql = sql.slice(markFunctionStart, markFunctionEnd)
const zeroFrequencyBranches = Array.from(
  planClassificationSql.matchAll(/WHEN\s+([\s\S]*?)\s+THEN\s+0\b/gi),
  (match) => match[1],
)
const recognizedFrequencyPatterns = Array.from(
  planClassificationSql.matchAll(/normalized_name\s*~\s*'([^']+)'/gi),
  (match) => new RegExp(match[1], 'i'),
)

const zeroFrequencyPlanCases = [
  { label: 'Obsequio', sqlFragment: "'obsequio'" },
  {
    label: 'Clase de Introducción',
    sqlFragment: "'clase de introducción'",
  },
  {
    label: 'Paquete clases sueltas',
    sqlFragment: "'paquete clases sueltas'",
  },
  {
    label: 'Paquete 8 clases',
    sqlFragment: "'paquete 8 clases'",
  },
]

describe('weekly attendance quota persistence', () => {
  it('stores a constrained weekly target on plans and membership snapshots', () => {
    expect(migrationName).toMatch(/^\d{14}_weekly_attendance_quota\.sql$/)
    expect(sql).toMatch(
      /ALTER TABLE public\.membership_plans[\s\S]*ADD COLUMN IF NOT EXISTS weekly_class_target integer NOT NULL DEFAULT 0[\s\S]*CHECK \(weekly_class_target BETWEEN 0 AND 4\)/i,
    )
    expect(sql).toMatch(
      /ALTER TABLE public\.student_memberships[\s\S]*ADD COLUMN IF NOT EXISTS weekly_class_target integer NOT NULL DEFAULT 0[\s\S]*CHECK \(weekly_class_target BETWEEN 0 AND 4\)/i,
    )
  })

  it('classifies existing weekly plans from one to four classes', () => {
    expect(planClassificationSql).toMatch(/SET weekly_class_target\s*=\s*CASE/i)
    expect(planClassificationSql).toMatch(/Media Beca[\s\S]*THEN 1/i)
    expect(planClassificationSql).toMatch(/afiliad[\s\S]*THEN 1/i)
    expect(planClassificationSql).toMatch(/1\s+clase[\s\S]*THEN 1/i)
    expect(planClassificationSql).toMatch(/2\s+clases[\s\S]*THEN 2/i)
    expect(planClassificationSql).toMatch(/3\s+clases[\s\S]*THEN 3/i)
    expect(planClassificationSql).toMatch(/4\s+clases[\s\S]*THEN 4/i)
  })

  it.each(zeroFrequencyPlanCases)(
    'classifies $label in a CASE branch that resolves to zero',
    ({ sqlFragment }) => {
      expect(
        zeroFrequencyBranches.some((branch) => branch.includes(sqlFragment)),
      ).toBe(true)
    },
  )

  it('classifies every unrecognized plan as zero', () => {
    expect(planClassificationSql).toMatch(/ELSE\s+0\s+END/i)
  })

  it('uses anchored normalized names without matching negative affiliation or larger numbers', () => {
    expect(planClassificationSql).toMatch(/normalized_name/i)
    expect(planClassificationSql).not.toContain("LIKE '%afiliad%'")
    expect(planClassificationSql).not.toContain("LIKE '%1 clase por semana%'")
    expect(planClassificationSql).toMatch(/normalized_name\s*~\s*'\^[^']*afiliad[^']*\$'/i)
    expect(planClassificationSql).toMatch(/normalized_name\s*~\s*'\^[^']*1[^']*\$'/i)
    expect(
      recognizedFrequencyPatterns.some((pattern) => pattern.test('no afiliado')),
    ).toBe(false)
    expect(
      recognizedFrequencyPatterns.some((pattern) =>
        pattern.test('12 clases por semana'),
      ),
    ).toBe(false)
  })

  it('runs plan and membership backfills only when their columns are first created', () => {
    expect(sql).toMatch(
      /information_schema\.columns[\s\S]*table_name\s*=\s*'membership_plans'[\s\S]*column_name\s*=\s*'weekly_class_target'[\s\S]*INTO v_plan_column_created/i,
    )
    expect(sql).toMatch(
      /information_schema\.columns[\s\S]*table_name\s*=\s*'student_memberships'[\s\S]*column_name\s*=\s*'weekly_class_target'[\s\S]*INTO v_membership_column_created/i,
    )
    expect(sql).toMatch(
      /IF v_plan_column_created THEN[\s\S]*?UPDATE public\.membership_plans[\s\S]*?END IF/i,
    )
    expect(sql).toMatch(
      /IF v_membership_column_created THEN[\s\S]*?UPDATE public\.student_memberships[\s\S]*?END IF/i,
    )
    expect(sql.match(/UPDATE public\.membership_plans/gi)).toHaveLength(1)
    expect(sql.match(/UPDATE public\.student_memberships/gi)).toHaveLength(1)
  })

  it('backfills every existing membership from its plan while keeping unlinked rows compatible', () => {
    expect(sql).toMatch(
      /UPDATE public\.student_memberships(?:\s+(?:AS\s+)?sm)?[\s\S]*SET weekly_class_target\s*=\s*COALESCE\(mp\.weekly_class_target, 0\)[\s\S]*FROM public\.membership_plans(?:\s+(?:AS\s+)?mp)?[\s\S]*sm\.membership_plan_id\s*=\s*mp\.id/i,
    )
  })

  it('copies the plan target only on insert or when the assigned plan changes', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_student_membership_weekly_class_target\(\)/i)
    expect(sql).toContain('RETURNS trigger')
    expect(sql).toContain('SET search_path = public')
    expect(sql).toMatch(
      /SELECT mp\.weekly_class_target[\s\S]*INTO NEW\.weekly_class_target[\s\S]*FROM public\.membership_plans(?:\s+(?:AS\s+)?mp)?[\s\S]*WHERE mp\.id\s*=\s*NEW\.membership_plan_id/i,
    )
    expect(sql).toMatch(
      /CREATE TRIGGER set_student_membership_weekly_class_target[\s\S]*BEFORE INSERT OR UPDATE OF membership_plan_id ON public\.student_memberships[\s\S]*FOR EACH ROW[\s\S]*EXECUTE FUNCTION public\.set_student_membership_weekly_class_target\(\)/i,
    )
    expect(sql).not.toMatch(/(?:AFTER|BEFORE) UPDATE(?: OF weekly_class_target)? ON public\.membership_plans/i)
  })

  it('preserves the snapshot when a referenced plan is deleted and defaults planless inserts to zero', () => {
    expect(triggerFunctionSql).toMatch(
      /TG_OP\s*=\s*'UPDATE'[\s\S]*NEW\.membership_plan_id IS NULL[\s\S]*NEW\.weekly_class_target\s*:=\s*OLD\.weekly_class_target/i,
    )
    expect(triggerFunctionSql).toMatch(
      /TG_OP\s*=\s*'INSERT'[\s\S]*NEW\.membership_plan_id IS NULL[\s\S]*NEW\.weekly_class_target\s*:=\s*0/i,
    )
  })
})

describe('weekly attendance quota deficits', () => {
  it('stores multiple auditable weekly absences with one ledger movement each', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.student_weekly_attendance[\s\S]*ADD COLUMN IF NOT EXISTS occurrence_index smallint/i,
    )
    expect(sql).toMatch(
      /UPDATE public\.student_weekly_attendance[\s\S]*occurrence_index\s*=\s*1[\s\S]*occurrence_index IS NULL/i,
    )
    expect(sql).toMatch(
      /UNIQUE\s*\(student_id,\s*week_start,\s*occurrence_index\)/i,
    )
    expect(sql).toMatch(
      /ALTER TABLE public\.student_weekly_attendance[\s\S]*ADD COLUMN IF NOT EXISTS note text/i,
    )
    expect(sql).toMatch(/CHECK\s*\(classes_consumed\s*=\s*1\)/i)
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*ON public\.student_credit_ledger\s*\(weekly_attendance_id\)[\s\S]*weekly_attendance_id IS NOT NULL/i,
    )
  })

  it('stores a nullable request key with global uniqueness for committed attempts', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.student_weekly_attendance[\s\S]*ADD COLUMN IF NOT EXISTS idempotency_key uuid/i,
    )
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*ON public\.student_weekly_attendance\s*\(idempotency_key\)[\s\S]*WHERE idempotency_key IS NOT NULL/i,
    )
  })

  it('reviews a closed Lima Thursday-to-Sunday roster with protected statuses excluded', () => {
    expect(reviewFunctionSql).toContain('SECURITY DEFINER')
    expect(reviewFunctionSql).toContain('SET search_path = public')
    expect(reviewFunctionSql).toContain('auth.uid()')
    expect(reviewFunctionSql).toContain('public.is_admin_user()')
    expect(reviewFunctionSql).toContain('EXTRACT(DOW FROM p_sunday) <> 0')
    expect(reviewFunctionSql).toContain("AT TIME ZONE 'America/Lima'")
    expect(reviewFunctionSql).toContain('v_week_start := p_sunday - 3')
    expect(reviewFunctionSql).toContain("pending_booking.status = 'reserved'")
    expect(reviewFunctionSql).toContain('v_pending_count = 0')
    expect(reviewFunctionSql).toMatch(
      /'inactive'\s*,\s*'paused'\s*,\s*'retired'\s*,\s*'withdrawn'\s*,\s*'blocked'\s*,\s*'suspended'/i,
    )
    expect(markFunctionSql).toMatch(
      /COALESCE\(st\.operational_status,\s*''\)\s+NOT IN\s*\(\s*'inactive'\s*,\s*'paused'\s*,\s*'retired'\s*,\s*'withdrawn'\s*,\s*'blocked'\s*,\s*'suspended'/i,
    )
  })

  it('derives a positive quota independently from zero-frequency memberships', () => {
    expect(reviewFunctionSql).toMatch(
      /FROM public\.student_memberships\s+(?:AS\s+)?quota_membership[\s\S]*quota_membership\.weekly_class_target\s*>\s*0/i,
    )
    expect(reviewFunctionSql).toMatch(
      /quota_membership\.start_date\s*<=\s*p_sunday[\s\S]*quota_membership\.end_date\s+IS\s+NULL[\s\S]*quota_membership\.end_date\s*>=\s*p_sunday/i,
    )
    expect(reviewFunctionSql).toMatch(
      /ORDER BY[\s\S]*quota_membership\.start_date ASC[\s\S]*quota_membership\.created_at ASC[\s\S]*quota_membership\.id ASC/i,
    )
  })

  it('returns the completion breakdown and only an actionable deficit', () => {
    for (const field of [
      'weekly_class_target',
      'attended_count',
      'booking_no_show_count',
      'weekly_no_show_count',
      'completed_count',
      'missing_count',
    ]) {
      expect(reviewFunctionSql).toContain(`'${field}'`)
    }

    expect(reviewFunctionSql).toMatch(
      /attendance_booking\.status\s*=\s*'attended'/i,
    )
    expect(reviewFunctionSql).toMatch(
      /attendance_booking\.status\s*=\s*'no_show'/i,
    )
    expect(reviewFunctionSql).toMatch(
      /COUNT\(\*\)[\s\S]*FROM public\.student_weekly_attendance/i,
    )
    expect(reviewFunctionSql).toMatch(
      /LEAST\([\s\S]*GREATEST\([\s\S]*weekly_class_target[\s\S]*attended_count[\s\S]*booking_no_show_count[\s\S]*weekly_no_show_count[\s\S]*available_classes/i,
    )
    expect(reviewFunctionSql).toMatch(/missing_count\s*>\s*0/i)
  })

  it('exposes the next FIFO membership while preserving reserved commitments', () => {
    expect(reviewFunctionSql).toMatch(
      /consumption_membership\.classes_remaining\s*>[\s\S]*reserved_count/i,
    )
    expect(reviewFunctionSql).toMatch(
      /ORDER BY[\s\S]*consumption_membership\.start_date ASC[\s\S]*consumption_membership\.created_at ASC[\s\S]*consumption_membership\.id ASC/i,
    )
    expect(reviewFunctionSql).toContain("reserved_booking.status = 'reserved'")
    expect(reviewFunctionSql).toContain("'membership_id'")
    expect(reviewFunctionSql).toContain("'classes_remaining'")
  })

  it('recalculates under locks and consumes one FIFO class without a retry loop', () => {
    expect(markFunctionSql).toContain('FOR UPDATE')
    expect(markFunctionSql).not.toMatch(/\bLOOP\b/i)
    expect(markFunctionSql).toContain("pending_booking.status = 'reserved'")
    expect(markFunctionSql).toMatch(
      /ORDER BY[\s\S]*sm\.start_date ASC[\s\S]*sm\.created_at ASC[\s\S]*sm\.id ASC[\s\S]*FOR UPDATE/i,
    )
    expect(markFunctionSql).toMatch(
      /reserved_booking\.active_membership_id\s*=\s*sm\.id[\s\S]*reserved_booking\.status\s*=\s*'reserved'/i,
    )
    expect(markFunctionSql).toMatch(
      /classes_used\s*=\s*classes_used\s*\+\s*1[\s\S]*classes_remaining\s*=\s*classes_remaining\s*-\s*1/i,
    )
  })

  it('writes the next occurrence, dynamic note, linked ledger row and remaining deficit', () => {
    expect(markFunctionSql).toMatch(
      /MAX\(swa\.occurrence_index\)[\s\S]*\+\s*1/i,
    )
    expect(markFunctionSql).toContain('occurrence_index')
    expect(markFunctionSql).toContain('note')
    expect(markFunctionSql).toContain(
      'El alumno asistió %s de las %s clases requeridas esta semana. Esta clase se considera inasistida.',
    )
    expect(markFunctionSql).toContain(
      'El alumno asistió %s de la 1 clase requerida esta semana. Esta clase se considera inasistida.',
    )
    expect(markFunctionSql).toContain("'weekly_no_show_consumed'")
    expect(markFunctionSql).toMatch(
      /weekly_attendance_id[\s\S]*v_weekly_attendance_id/i,
    )
    expect(markFunctionSql).toContain("'remaining_missing_count'")
    expect(markFunctionSql).toContain("'classes_remaining'")
  })

  it('deduplicates retries by request id before any second debit', () => {
    expect(markFunctionSql).toMatch(
      /admin_mark_weekly_no_show\([\s\S]*p_student_id uuid[\s\S]*p_sunday date[\s\S]*p_request_id uuid[\s\S]*\)/i,
    )
    expect(markFunctionSql).toMatch(
      /p_request_id IS NULL[\s\S]*RAISE EXCEPTION/i,
    )
    expect(
      markFunctionSql.match(
        /WHERE swa\.idempotency_key\s*=\s*p_request_id/gi,
      ),
    ).toHaveLength(2)
    const firstRetryLookup = markFunctionSql.indexOf(
      'WHERE swa.idempotency_key = p_request_id',
    )
    const studentLock = markFunctionSql.indexOf('FROM public.students st')
    const weeklyInsert = markFunctionSql.indexOf(
      'INSERT INTO public.student_weekly_attendance',
    )
    expect(firstRetryLookup).toBeGreaterThan(-1)
    expect(firstRetryLookup).toBeLessThan(studentLock)
    expect(markFunctionSql.lastIndexOf(
      'WHERE swa.idempotency_key = p_request_id',
    )).toBeGreaterThan(studentLock)
    expect(markFunctionSql.lastIndexOf(
      'WHERE swa.idempotency_key = p_request_id',
    )).toBeLessThan(weeklyInsert)
    expect(markFunctionSql).toMatch(
      /INSERT INTO public\.student_weekly_attendance\s*\([\s\S]*idempotency_key[\s\S]*\)[\s\S]*VALUES\s*\([\s\S]*p_request_id/i,
    )
    expect(sql).toContain('result_remaining_missing_count')
    expect(sql).toContain('membership_classes_remaining_after')
    expect(markFunctionSql).toMatch(
      /v_existing_remaining_missing_count[\s\S]*'remaining_missing_count',\s*COALESCE\(v_existing_remaining_missing_count,\s*0\)/i,
    )
    expect(markFunctionSql).toMatch(
      /v_existing_balance_after[\s\S]*'classes_remaining',\s*COALESCE\(v_existing_balance_after,\s*v_balance_after\)/i,
    )
    expect(transactionalTestSql).toMatch(
      /v_retry_result\s*->>\s*'remaining_missing_count'[\s\S]*v_first_result\s*->>\s*'remaining_missing_count'/i,
    )
  })

  it('keeps a two-argument compatibility wrapper that creates one key per legacy click', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_mark_weekly_no_show\(\s*p_student_id uuid,\s*p_sunday date\s*\)[\s\S]*RETURN public\.admin_mark_weekly_no_show\(\s*p_student_id,\s*p_sunday,\s*gen_random_uuid\(\)\s*\)/i,
    )
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date, uuid) FROM PUBLIC;',
    )
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show(uuid, date, uuid) FROM anon;',
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.admin_mark_weekly_no_show(uuid, date, uuid) TO authenticated, service_role;',
    )
  })

  it('does not retain an unused membership balance variable', () => {
    expect(markFunctionSql).not.toContain('v_membership_classes_remaining')
  })

  it('keeps no-deficit and no-credit calls idempotent without writes', () => {
    expect(markFunctionSql).toMatch(
      /IF\s+v_raw_missing_count\s*<=\s*0[\s\S]*'already_marked'\s*,\s*true[\s\S]*RETURN/i,
    )
    expect(markFunctionSql).toMatch(
      /IF\s+v_membership_id\s+IS\s+NULL[\s\S]*'already_marked'\s*,\s*true[\s\S]*RETURN/i,
    )
  })

  it('keeps both RPCs restricted to authenticated administrators', () => {
    for (const signature of [
      'get_weekly_attendance_review(date)',
      'admin_mark_weekly_no_show(uuid, date)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`)
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`,
      )
    }
  })

  it('ships a rollback-only SQL scenario for retry, new click, FIFO and reservations', () => {
    expect(transactionalTestSql).toMatch(/^BEGIN;/i)
    expect(transactionalTestSql.trimEnd()).toMatch(/ROLLBACK;$/i)
    expect(transactionalTestSql).toContain('request_id_retry')
    expect(transactionalTestSql).toContain('request_id_new_click')
    expect(transactionalTestSql).toMatch(
      /admin_mark_weekly_no_show\([\s\S]*request_id_retry[\s\S]*admin_mark_weekly_no_show\([\s\S]*request_id_retry/i,
    )
    expect(transactionalTestSql).toMatch(
      /admin_mark_weekly_no_show\([\s\S]*request_id_new_click/i,
    )
    expect(transactionalTestSql).toContain("movement_type = 'weekly_no_show_consumed'")
    expect(transactionalTestSql).toMatch(
      /INSERT INTO public\.bookings\s*\([\s\S]*status[\s\S]*active_membership_id[\s\S]*VALUES\s*\([\s\S]*'reserved'[\s\S]*v_first_membership_id/i,
    )
    expect(transactionalTestSql).toMatch(
      /INSERT INTO public\.bookings\s*\([\s\S]*user_id[\s\S]*VALUES\s*\([\s\S]*v_admin_id/i,
    )
    expect(transactionalTestSql).not.toMatch(
      /INSERT INTO public\.bookings\s*\([\s\S]*intro_client_id/i,
    )
    expect(transactionalTestSql).toMatch(/RAISE EXCEPTION/i)
    expect(transactionalTestSql).not.toMatch(/@[a-z0-9.-]+\.(com|pe)\b/i)
  })
})
