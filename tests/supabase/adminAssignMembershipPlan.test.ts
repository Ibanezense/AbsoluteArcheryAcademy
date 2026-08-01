import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260801_190000_multiple_active_student_memberships.sql'
)

describe('20260801 multiple active membership cycles migration', () => {
  it('creates a separate active membership without replacing active siblings', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const functionMarker =
      'CREATE OR REPLACE FUNCTION public.admin_assign_membership_plan'
    const functionStart = sql.indexOf(functionMarker)
    const remainingSql =
      functionStart === -1
        ? ''
        : sql.slice(functionStart + functionMarker.length)
    const nextFunctionOffset = remainingSql.search(
      /\n\s*CREATE OR REPLACE FUNCTION public\./,
    )
    const assignmentSql =
      functionStart === -1
        ? ''
        : nextFunctionOffset === -1
          ? sql.slice(functionStart)
          : sql.slice(
              functionStart,
              functionStart + functionMarker.length + nextFunctionOffset,
            )

    expect(assignmentSql).toContain(functionMarker)
    expect(assignmentSql).toMatch(/INSERT INTO public\.student_memberships[\s\S]*classes_total[\s\S]*classes_used[\s\S]*classes_remaining/s)
    expect(assignmentSql).toMatch(/VALUES \([\s\S]*v_plan\.classes_included,[\s\S]*0,[\s\S]*v_plan\.classes_included/s)
    expect(assignmentSql).toContain("'membership_activation'")
    expect(assignmentSql).toContain("'paid'")
    expect(assignmentSql).not.toMatch(
      /UPDATE\s+public\.student_memberships(?:\s+(?:AS\s+)?[a-z_][a-z0-9_]*)?[\s\S]*?\bstatus\s*=\s*'historical'/i,
    )
  })
})
