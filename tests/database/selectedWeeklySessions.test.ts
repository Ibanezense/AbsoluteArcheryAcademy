import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { it, expect } from 'vitest'

it('generates only selected schedules, preserves existing sessions, and requires an administrator', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin', true) = '1' $$;
      CREATE TABLE academy_locations(id uuid primary key, timezone text, opens_on date, is_active boolean);
      CREATE TABLE weekly_session_templates(id uuid primary key, location_id uuid, weekday int, start_time time, end_time time, is_active boolean, label text, physical_capacity int, slots_per_target int);
      CREATE TABLE weekly_session_template_distances(weekly_template_id uuid, distance_m int, slot_capacity int);
      CREATE TABLE sessions(id uuid primary key default gen_random_uuid(), start_at timestamptz, end_at timestamptz, status text, notes text, weekly_template_id uuid, is_manual_override boolean, location_id uuid, capacity int);
      CREATE TABLE session_distance_allocations(session_id uuid, distance_m int, targets int, slot_capacity int);
      CREATE UNIQUE INDEX session_unique ON sessions(location_id,start_at,end_at) WHERE status = 'scheduled';
      INSERT INTO academy_locations VALUES ('00000000-0000-0000-0000-000000000001','America/Lima',NULL,true);
      INSERT INTO weekly_session_templates VALUES
        ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',1,'10:00','11:30',true,'Verano',4,2),
        ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001',1,'13:00','14:30',true,'Normal',4,2);
      INSERT INTO weekly_session_template_distances VALUES ('00000000-0000-0000-0000-000000000011',10,4),('00000000-0000-0000-0000-000000000012',10,4);
      SELECT set_config('test.admin','0',false);
    `)
    await db.exec(readFileSync('docs/sql/selected_weekly_sessions.sql', 'utf8'))
    const query = "SELECT public.admin_generate_selected_weekly_sessions('2030-01-07', 2, ARRAY['00000000-0000-0000-0000-000000000011'::uuid]) AS count"
    await expect(db.query(query)).rejects.toThrow('No autorizado')
    await db.exec("SELECT set_config('test.admin','1',false)")
    await expect(db.query("SELECT public.admin_generate_selected_weekly_sessions('2030-01-07', 1, ARRAY[]::uuid[])")).rejects.toThrow('Selecciona')
    expect((await db.query(query)).rows).toEqual([{ count:2 }])
    expect((await db.query(query)).rows).toEqual([{ count:0 }])
    await db.exec("UPDATE sessions SET status = 'cancelled' WHERE start_at = '2030-01-07 15:00Z'")
    expect((await db.query(query)).rows).toEqual([{ count:0 }])
    await expect(db.query("SELECT public.admin_generate_selected_weekly_sessions('2030-01-07', 1, ARRAY['00000000-0000-0000-0000-000000000099'::uuid])")).rejects.toThrow('no está activo')
    const sessions = await db.query<{ notes:string; start_at:Date }>('SELECT notes,start_at FROM sessions ORDER BY start_at')
    expect(sessions.rows.map(row => row.notes)).toEqual(['Verano','Verano'])
    expect((await db.query('SELECT count(*)::int AS count FROM session_distance_allocations')).rows).toEqual([{ count:2 }])
  } finally { await db.close() }
}, 30000)
