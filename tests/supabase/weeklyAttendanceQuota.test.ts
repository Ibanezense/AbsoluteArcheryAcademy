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
