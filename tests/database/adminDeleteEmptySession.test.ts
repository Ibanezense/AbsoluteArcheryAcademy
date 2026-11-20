import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('allows an admin to delete an empty turn and protects every booking status through either RPC', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin', true) = '1' $$;
      CREATE TABLE sessions(id uuid PRIMARY KEY);
      CREATE TABLE bookings(id integer PRIMARY KEY, session_id uuid REFERENCES sessions(id), status text);
      CREATE TABLE session_distance_allocations(session_id uuid REFERENCES sessions(id));
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
      INSERT INTO bookings VALUES (1, '00000000-0000-0000-0000-000000000002', 'cancelled');
      INSERT INTO session_distance_allocations VALUES ('00000000-0000-0000-0000-000000000003');
      SELECT set_config('test.admin', '0', false);
    `)
    await db.exec(readFileSync('supabase/migrations/20261119203000_admin_delete_only_empty_sessions.sql', 'utf8'))
    await expect(db.query("SELECT admin_delete_empty_session('00000000-0000-0000-0000-000000000003')")).rejects.toThrow('administradores')
    await db.exec("SELECT set_config('test.admin', '1', false)")
    for (const fn of ['admin_delete_empty_session', 'admin_delete_session']) {
      await expect(db.query(`SELECT ${fn}('00000000-0000-0000-0000-000000000002')`)).rejects.toThrow('historial')
    }
    await db.query("SELECT admin_delete_empty_session('00000000-0000-0000-0000-000000000003')")
    expect((await db.query('SELECT id FROM sessions')).rows).toEqual([{ id: '00000000-0000-0000-0000-000000000002' }])
    expect((await db.query('SELECT status FROM bookings')).rows).toEqual([{ status: 'cancelled' }])
    expect((await db.query('SELECT * FROM session_distance_allocations')).rows).toEqual([])
  } finally {
    await db.close()
  }
}, 30000)
