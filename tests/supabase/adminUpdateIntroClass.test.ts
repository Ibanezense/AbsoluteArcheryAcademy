import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260608_090000_admin_update_intro_class.sql',
)

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

describe('admin update intro class migration', () => {
  it('adds an admin-only RPC to edit prospect, payment and schedule atomically', () => {
    const sql = migrationSql()

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_update_intro_class(')
    expect(sql).toContain('p_booking_id uuid')
    expect(sql).toContain('p_intro_client_id uuid')
    expect(sql).toContain('p_session_id uuid')
    expect(sql).toContain('IF NOT public.is_admin_user() THEN')
    expect(sql).toContain('Reserva de clase intro no encontrada')
    expect(sql).toContain('UPDATE public.intro_clients')
    expect(sql).toContain('UPDATE public.bookings')
    expect(sql).toContain('UPDATE public.intro_payments')
    expect(sql).toContain("payment_status IN ('pending', 'paid')")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_update_intro_class')
  })
})
