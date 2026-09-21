import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_recurring_intro_schedules_by_location.sql'),
)
const migrationPath = migrationName ? join(migrationsDir, migrationName) : ''
const sql = migrationPath && existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : ''

function functionSql(functionName: string) {
  const candidates = [
    `CREATE OR REPLACE FUNCTION public.${functionName}`,
    `CREATE FUNCTION public.${functionName}`,
  ]
  const start = candidates
    .map((marker) => sql.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1

  if (start < 0) return ''
  const end = sql.indexOf('\n$$;', start)
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4)
}

describe('recurring intro schedules by location migration', () => {
  it('adds one intro flag to the canonical weekly templates', () => {
    expect(migrationName).toBeTruthy()
    expect(sql).toMatch(
      /ALTER TABLE public\.weekly_session_templates[\s\S]*ADD COLUMN IF NOT EXISTS allows_intro boolean NOT NULL DEFAULT false/i,
    )
    expect(sql).not.toMatch(/CREATE TABLE[^;]*intro[^;]*schedule/i)
  })

  it('backfills only the approved active days for each location', () => {
    expect(sql).toMatch(/location\.code = 'tiabaya'[\s\S]*weekday IN \(6, 7\)[\s\S]*template\.is_active/i)
    expect(sql).toMatch(/location\.code = 'umacollo'[\s\S]*weekday IN \(3, 4, 5\)[\s\S]*template\.is_active/i)
    expect(sql).toMatch(/SET allows_intro = false[\s\S]*location\.code = 'umacollo'[\s\S]*weekday = 2/i)
    expect(sql).toMatch(/ALTER COLUMN location_id SET NOT NULL/i)
  })

  it('upserts the template, distances and standard equipment in one admin RPC', () => {
    const rpc = functionSql('admin_upsert_weekly_template')
    expect(rpc).toContain('p_location_id uuid')
    expect(rpc).toContain('p_allows_intro boolean')
    expect(rpc).toContain('p_distances jsonb')
    expect(rpc).toContain('public.is_admin_user()')
    expect(rpc).toContain('INSERT INTO public.weekly_session_templates')
    expect(rpc).toContain('UPDATE public.weekly_session_templates')
    expect(rpc).toContain('DELETE FROM public.weekly_session_template_distances')
    expect(rpc).toContain('INSERT INTO public.weekly_session_template_distances')
    expect(rpc).toContain('INSERT INTO public.weekly_template_equipment_allocations')
    expect(rpc).toMatch(/CASE[\s\S]*WHEN v_location_code = 'umacollo' THEN 'fixed'[\s\S]*ELSE 'flexible'/i)
  })

  it('limits the template upsert RPC to authenticated administrators', () => {
    const signature = 'admin_upsert_weekly_template(uuid, uuid, text, smallint, time without time zone, time without time zone, boolean, boolean, jsonb)'
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`)
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`)
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`)
  })

  it('provides an internal eligibility helper for scheduled sessions in open locations', () => {
    const helper = functionSql('session_accepts_intro')
    expect(helper).toContain('p_session_id uuid')
    expect(helper).toContain("session.status = 'scheduled'")
    expect(helper).toContain('location.is_active = true')
    expect(helper).toContain('template.is_active = true')
    expect(helper).toContain('template.allows_intro = true')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.session_accepts_intro(uuid) FROM PUBLIC;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.session_accepts_intro(uuid) FROM anon, authenticated;')
  })

  it('filters intro availability by enabled template and optional location', () => {
    const availability = functionSql('get_available_intro_sessions')
    expect(availability).toContain('p_location_id uuid DEFAULT NULL')
    expect(availability).toContain('JOIN public.weekly_session_templates template')
    expect(availability).toContain('template.is_active = true')
    expect(availability).toContain('template.allows_intro = true')
    expect(availability).toContain('(p_location_id IS NULL OR session.location_id = p_location_id)')
    expect(availability).toContain("availability.data->>'intro_spots_remaining'")
    expect(availability).toContain('location.code')
    expect(availability).toContain('location.name')
    expect(availability).toContain('location.address')
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.get_available_intro_sessions(date, date);')
  })

  it('validates schedule eligibility after locking registration and moved sessions', () => {
    const register = functionSql('admin_register_intro_class')
    const update = functionSql('admin_update_intro_class')

    expect(register.indexOf('FOR UPDATE')).toBeGreaterThanOrEqual(0)
    expect(register.indexOf('session_accepts_intro')).toBeGreaterThan(register.indexOf('FOR UPDATE'))
    expect(update.indexOf('FOR UPDATE')).toBeGreaterThanOrEqual(0)
    expect(update).toContain('p_session_id <> v_booking.session_id')
    expect(update.indexOf('session_accepts_intro')).toBeGreaterThan(update.indexOf('FOR UPDATE'))
  })

  it('ships rollback-only transactional scenarios for both locations and disabled templates', () => {
    const transactionalPath = join(process.cwd(), 'supabase', 'tests', 'intro_schedules_by_location_transactional.sql')
    expect(existsSync(transactionalPath)).toBe(true)
    const transactionalSql = existsSync(transactionalPath) ? readFileSync(transactionalPath, 'utf8') : ''
    expect(transactionalSql).toContain('BEGIN;')
    expect(transactionalSql).toContain("'tiabaya'")
    expect(transactionalSql).toContain("'umacollo'")
    expect(transactionalSql).toContain('allows_intro = false')
    expect(transactionalSql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })
})
