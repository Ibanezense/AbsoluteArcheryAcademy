import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_admin_intro_week_capacity.sql'),
)
const sql = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), 'utf8')
  : ''

describe('admin intro week capacity RPC', () => {
  it('ships a dedicated additive migration', () => {
    expect(migrationName).toMatch(/^\d{14}_admin_intro_week_capacity\.sql$/)
    expect(existsSync(join(migrationsDirectory, migrationName ?? '__missing'))).toBe(true)
  })

  it('returns location metadata from Wednesday through Sunday', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_get_weekend_intro_capacity/i)
    expect(sql).toContain('location_id uuid')
    expect(sql).toContain('location_code text')
    expect(sql).toContain('location_name text')
    expect(sql).toMatch(/v_wednesday[\s\S]*date_trunc\('week',[\s\S]*\+ 2/i)
    expect(sql).toMatch(/BETWEEN v_wednesday AND v_sunday/i)
    expect(sql).toContain('JOIN public.academy_locations location')
  })

  it('selects Umacollo on weekdays and Tiabaya on the weekend', () => {
    expect(sql).toMatch(/location\.code = 'umacollo'[\s\S]*EXTRACT\(ISODOW[\s\S]*IN \(3, 4, 5\)/i)
    expect(sql).toMatch(/location\.code = 'tiabaya'[\s\S]*EXTRACT\(ISODOW[\s\S]*IN \(6, 7\)/i)
    expect(sql).toContain('template.is_active = true')
    expect(sql).toContain('template.allows_intro = true')
  })

  it('retains admin-only execution privileges', () => {
    expect(sql).toContain('public.is_admin_user()')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM PUBLIC;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_get_weekend_intro_capacity(date) FROM anon;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_get_weekend_intro_capacity(date) TO authenticated, service_role;')
  })
})
