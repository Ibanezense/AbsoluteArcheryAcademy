import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430_150000_fix_membership_renewal_canonical_options.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

describe('20260430 canonical membership renewal options migration', () => {
  it('defines exactly the four canonical renewal packages', () => {
    expect(sql).toContain("(4, '4 clases'::text, 160::numeric, 130::numeric)")
    expect(sql).toContain("(8, '8 clases'::text, 240::numeric, 170::numeric)")
    expect(sql).toContain("(12, '12 clases'::text, 310::numeric, NULL::numeric)")
    expect(sql).toContain("(16, '16 clases'::text, 370::numeric, NULL::numeric)")
  })

  it('returns renewal options from canonical packages instead of all active plans', () => {
    expect(sql).toContain('WITH canonical_packages')
    expect(sql).toContain('CROSS JOIN LATERAL')
    expect(sql).toContain('ORDER BY cp.classes_included ASC')
    expect(sql).not.toContain('ORDER BY mp.classes_included ASC')
  })

  it('rejects non-canonical plan ids when creating renewal requests', () => {
    expect(sql).toContain("RAISE EXCEPTION 'Plan de renovacion no disponible'")
    expect(sql).toContain('COALESCE(v_plan.base_price, 0) <> v_regular_price')
    expect(sql).toContain('COALESCE(v_plan.country_club_price, -1) <> COALESCE(v_country_club_price, -1)')
  })
})
