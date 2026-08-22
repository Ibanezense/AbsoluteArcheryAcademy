import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_admin_weekend_intro_capacity.sql'),
)
const migrationPath = migrationName
  ? join(migrationsDirectory, migrationName)
  : join(migrationsDirectory, '__missing_admin_weekend_intro_capacity.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('admin weekend intro capacity RPC', () => {
  it('returns the complete administrative weekend capacity contract', () => {
    expect(migrationName).toMatch(/^\d{14}_admin_weekend_intro_capacity\.sql$/)
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_get_weekend_intro_capacity\(\s*p_reference_date date DEFAULT NULL\s*\)/i,
    )
    expect(sql).toMatch(/RETURNS TABLE\s*\(\s*session_id uuid,\s*start_at timestamptz,\s*end_at timestamptz,\s*equipment_capacity integer,\s*equipment_reserved integer,\s*spots_remaining integer\s*\)/i)
  })

  it('calculates Saturday and Sunday from the current Lima week', () => {
    expect(sql).toContain("AT TIME ZONE 'America/Lima'")
    expect(sql).toMatch(
      /v_reference_date date := COALESCE\(\s*p_reference_date,\s*\(now\(\) AT TIME ZONE 'America\/Lima'\)::date\s*\);/i,
    )
    expect(sql).toMatch(/date_trunc\(\s*'week'\s*,\s*v_reference_date\s*\)::date\s*\+\s*5/i)
    expect(sql).toMatch(/v_sunday\s+date\s*:=\s*v_saturday\s*\+\s*1/i)
  })

  it('reuses canonical equipment availability for every scheduled weekend session', () => {
    expect(sql).toMatch(/FROM public\.sessions s/i)
    expect(sql).toMatch(/s\.status\s*=\s*'scheduled'/i)
    expect(sql).toMatch(/get_session_equipment_availability\(s\.id\)/i)
    expect(sql).toMatch(/CROSS JOIN LATERAL/i)
    expect(sql).toMatch(/\(2\s*\+\s*\(availability\.data->>'academy_capacity'\)::integer\)::integer/i)
    expect(sql).toMatch(/availability\.data->>'intro_reserved'[\s\S]*availability\.data->>'academy_students_reserved'/i)
    expect(sql).toMatch(/availability\.data->>'intro_spots_remaining'/i)
    expect(sql).toMatch(
      /\(s\.start_at AT TIME ZONE 'America\/Lima'\)::date BETWEEN v_saturday AND v_sunday/i,
    )
    expect(sql).toMatch(/ORDER BY s\.start_at/i)
  })

  it('intentionally keeps full sessions in the result', () => {
    expect(sql).not.toBe('')
    expect(sql).not.toMatch(/intro_spots_remaining'\)::integer\s*>\s*0/i)
    expect(sql).not.toMatch(/spots_remaining\s*>\s*0/i)
  })

  it('documents the additional intro equipment and complete dashboard result', () => {
    expect(sql).toMatch(
      /COMMENT ON FUNCTION public\.admin_get_weekend_intro_capacity\(date\) IS\s*'[^']*two exclusive 18 lb intro bows[^']*additional to the active 20 lb academy inventory[^']*full sessions are intentionally returned[^']*';/i,
    )
  })

  it('requires an authenticated admin and exposes execution only to trusted roles', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public')
    expect(sql).toMatch(/IF\s+auth\.uid\(\)\s+IS NULL\s+THEN/i)
    expect(sql).toMatch(/IF\s+NOT\s+public\.is_admin_user\(\)\s+THEN/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_get_weekend_intro_capacity\(date\) FROM PUBLIC;/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_get_weekend_intro_capacity\(date\) FROM anon;/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_get_weekend_intro_capacity\(date\) TO authenticated, service_role;/i)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]* TO (?:PUBLIC|anon);/i)
  })
})
