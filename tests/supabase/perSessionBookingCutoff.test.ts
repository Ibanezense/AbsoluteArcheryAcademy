import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith('_per_session_booking_cutoff.sql'),
)
const migrationPath = migrationName ? join(migrationsDirectory, migrationName) : ''
const sql = migrationPath && existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

function functionSql(name: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  if (start < 0) return ''
  const end = sql.indexOf('\n$$;', start)
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4)
}

describe('per-session booking cutoff migration', () => {
  it('keeps a future session visible until two hours before that specific session', () => {
    expect(migrationName).toMatch(/^\d{14}_per_session_booking_cutoff\.sql$/)

    const availability = functionSql('get_available_multisite_sessions_for_student')

    expect(availability).toContain('session.start_at > now()')
    expect(availability).toContain("now() < session.start_at - interval '2 hours'")
    expect(availability).not.toContain('get_booking_day_cutoff')
  })

  it('enforces the same per-session cutoff atomically when booking', () => {
    const booking = functionSql('book_session_multisite')

    expect(booking).toContain('v_session_cutoff := v_session.start_at - interval \'2 hours\'')
    expect(booking).toContain('IF now() >= v_session_cutoff THEN')
    expect(booking).toContain('Las reservas para este turno se cerraron 2 horas antes de su inicio')
    expect(booking).not.toContain('get_booking_day_cutoff')
  })

  it('preserves authorization and execute permissions on both RPCs', () => {
    const availability = functionSql('get_available_multisite_sessions_for_student')
    const booking = functionSql('book_session_multisite')

    expect(availability).toContain('resolve_accessible_student_id')
    expect(booking).toContain('resolve_accessible_student_id')
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.book_session_multisite(uuid, uuid) FROM PUBLIC, anon',
    )
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) FROM PUBLIC, anon',
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.book_session_multisite(uuid, uuid) TO authenticated, service_role',
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_available_multisite_sessions_for_student(uuid, date, date) TO authenticated, service_role',
    )
  })
})
