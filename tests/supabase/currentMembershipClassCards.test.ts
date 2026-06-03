import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260602_120000_current_membership_class_cards.sql',
)

describe('current membership class cards migration', () => {
  it('shows only the active membership cycle by default on reservation class cards', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')
    const elseStart = sql.indexOf('ELSE')
    const defaultSelection = sql.slice(
      sql.indexOf('SELECT sm.id', elseStart),
      sql.indexOf('IF v_membership_id IS NULL', elseStart),
    )

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_student_class_cards')
    expect(defaultSelection).toContain("AND sm.status = 'active'")
    expect(defaultSelection).not.toContain("WHEN sm.status = 'draft'")
    expect(defaultSelection).not.toContain('ELSE 2')
    expect(sql).toContain('membresias historicas quedan para historial')
  })
})
