import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260416_130000_add_daily_booking_cutoff.sql'
)

describe('20260416 daily booking cutoff migration', () => {
  it('adds a shared daily cutoff helper and enforces it on self-service booking flows', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_booking_day_cutoff')
    expect(sql).toContain("DATE(s.start_at AT TIME ZONE 'America/Lima') = p_session_date")
    expect(sql).toContain("v_first_session_start - interval '2 hours'")
    expect(sql).toContain("Las reservas para este dia se cerraron 2 horas antes del primer turno")
    expect(sql).toContain("v_session_day_cutoff := public.get_booking_day_cutoff")
    expect(sql).toContain("v_old_day_cutoff := public.get_booking_day_cutoff")
    expect(sql).toContain("v_new_day_cutoff := public.get_booking_day_cutoff")
    expect(sql).toContain("booking_day_cutoff_at timestamptz")
    expect(sql).toContain("Permite a los administradores reservar clases para alumnos incluso si el turno ya comenzo o quedo en el pasado")
    expect(sql).toContain("Admins pueden reservar incluso turnos ya iniciados o pasados")
  })
})
