import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260601_120000_admin_intro_and_session_atomic_rpcs.sql',
)

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8')
}

function functionSql(sql: string, functionName: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('GRANT EXECUTE ON FUNCTION', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('20260601 atomic intro and session RPCs', () => {
  it('registers intro client, booking and payment inside one admin RPC', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_register_intro_class')

    expect(rpc).toContain('SECURITY DEFINER')
    expect(rpc).toContain('public.is_admin_user()')
    expect(rpc).toContain('INSERT INTO public.intro_clients')
    expect(rpc).toContain('INSERT INTO public.bookings')
    expect(rpc).toContain('INSERT INTO public.intro_payments')
    expect(rpc).toContain('FOR UPDATE')
    expect(rpc).toContain('RAISE EXCEPTION')
    expect(rpc).not.toContain('EXCEPTION\n  WHEN OTHERS')
  })

  it('keeps intro registration atomic by rejecting full sessions before inserting rows', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_register_intro_class')

    expect(rpc).toContain('v_booked_count >= v_capacity')
    expect(rpc).toContain('No hay cupos disponibles')
    expect(rpc.indexOf('v_booked_count >= v_capacity')).toBeLessThan(
      rpc.indexOf('INSERT INTO public.intro_clients'),
    )
  })

  it('upserts sessions and allocations inside one admin RPC', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_upsert_session_with_allocations')

    expect(rpc).toContain('SECURITY DEFINER')
    expect(rpc).toContain('public.is_admin_user()')
    expect(rpc).toContain('UPDATE public.sessions')
    expect(rpc).toContain('INSERT INTO public.sessions')
    expect(rpc).toContain('DELETE FROM public.session_distance_allocations')
    expect(rpc).toContain('INSERT INTO public.session_distance_allocations')
    expect(rpc).toContain('FOR UPDATE')
    expect(rpc).toContain('RAISE EXCEPTION')
    expect(rpc).not.toContain('EXCEPTION\n  WHEN OTHERS')
  })

  it('preserves previous session allocations on simulated allocation insert failure by propagating the exception', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_upsert_session_with_allocations')

    expect(rpc).toContain("jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))")
    expect(rpc).toContain('slot_capacity > 0')
    expect(rpc).toContain('Debe configurar al menos un cupo por distancia')
    expect(rpc).not.toContain('RETURN json_build_object(\n      \'success\', false')
  })

  it('rejects reducing a session distance below existing active bookings before replacing allocations', () => {
    const sql = migrationSql()
    const rpc = functionSql(sql, 'admin_upsert_session_with_allocations')

    expect(rpc).toContain('active_booking_counts')
    expect(rpc).toContain("b.status IN ('reserved', 'attended', 'no_show')")
    expect(rpc).toContain('COALESCE(ra.slot_capacity, 0) < abc.booked_count')
    expect(rpc).toContain('No se puede reducir la capacidad por debajo de las reservas existentes')
    expect(rpc.indexOf('No se puede reducir la capacidad por debajo de las reservas existentes')).toBeLessThan(
      rpc.indexOf('DELETE FROM public.session_distance_allocations'),
    )
  })
})
