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

  it('classifies existing plans and defaults unknown or package plans to zero', () => {
    expect(sql).toMatch(/UPDATE public\.membership_plans[\s\S]*SET weekly_class_target\s*=\s*CASE/i)
    expect(sql).toMatch(/Media Beca[\s\S]*THEN 1/i)
    expect(sql).toMatch(/afiliad[\s\S]*THEN 1/i)
    expect(sql).toMatch(/1\s+clase[\s\S]*THEN 1/i)
    expect(sql).toMatch(/2\s+clases[\s\S]*THEN 2/i)
    expect(sql).toMatch(/3\s+clases[\s\S]*THEN 3/i)
    expect(sql).toMatch(/4\s+clases[\s\S]*THEN 4/i)
    expect(sql).toMatch(/Obsequio|Clase de Introducci[oó]n|Paquete clases sueltas|Paquete 8 clases/i)
    expect(sql).toMatch(/ELSE 0\s+END/i)
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
})
