import { PGlite } from '@electric-sql/pglite'
import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('cancels the session atomically, frees reserved classes without credit inflation, and only permits admins', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid()='00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE TABLE sessions(id uuid PRIMARY KEY,status text,notes text);
      CREATE TABLE student_memberships(id uuid PRIMARY KEY,classes_remaining int);
      CREATE TABLE bookings(id uuid PRIMARY KEY,session_id uuid,student_id uuid,active_membership_id uuid,status text,cancelled_at timestamptz,cancelled_by_profile_id uuid,cancelled_by_role text,updated_at timestamptz);
      CREATE TABLE booking_cancellations(booking_id uuid UNIQUE,student_id uuid,cancellation_source text,review_status text,admin_reason text,cancelled_by uuid);
      CREATE TABLE resource_releases(booking_id uuid,reason text);
      CREATE FUNCTION public.release_booking_resources(p_booking uuid,p_reason text) RETURNS void LANGUAGE sql AS $$ INSERT INTO resource_releases VALUES(p_booking,p_reason) $$;
      INSERT INTO sessions VALUES('00000000-0000-0000-0000-000000000002','scheduled',NULL);
      INSERT INTO student_memberships VALUES('00000000-0000-0000-0000-000000000003',3);
      INSERT INTO bookings(id,session_id,student_id,active_membership_id,status) VALUES
       ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','reserved'),
       ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002',NULL,NULL,'reserved');
    `)
    const old = readFileSync('supabase/migrations/20260915013310_multisite_memberships_core.sql', 'utf8')
    const start = old.indexOf('CREATE OR REPLACE FUNCTION public.admin_cancel_session(')
    await db.exec(old.slice(start, old.indexOf('\n$$;', start) + 4))
    const fix = 'supabase/migrations/20261110205656_fix_cancel_session.sql'
    if (existsSync(fix)) await db.exec(readFileSync(fix, 'utf8'))
    await db.exec("SELECT set_config('test.actor','00000000-0000-0000-0000-000000000099',false)")
    await expect(db.query("SELECT public.admin_cancel_session('00000000-0000-0000-0000-000000000002','Campeonato')")).rejects.toThrow('administradores')
    await db.exec("SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false)")
    const result = await db.query<{ count: number }>("SELECT public.admin_cancel_session('00000000-0000-0000-0000-000000000002','Campeonato') count")
    expect(result.rows[0].count).toBe(2)
    expect((await db.query("SELECT status FROM sessions")).rows[0]).toEqual({ status: 'cancelled' })
    expect((await db.query("SELECT count(*)::int n FROM bookings WHERE status='reserved'")).rows[0]).toEqual({ n: 0 })
    expect((await db.query('SELECT classes_remaining FROM student_memberships')).rows[0]).toEqual({ classes_remaining: 3 })
    expect((await db.query('SELECT count(*)::int n FROM resource_releases')).rows[0]).toEqual({ n: 2 })
    expect((await db.query('SELECT count(*)::int n FROM booking_cancellations')).rows[0]).toEqual({ n: 2 })
    expect((await db.query("SELECT public.admin_cancel_session('00000000-0000-0000-0000-000000000002','Campeonato') count")).rows[0]).toEqual({count:0})
    expect((await db.query('SELECT classes_remaining FROM student_memberships')).rows[0]).toEqual({ classes_remaining: 3 })
  } finally { await db.close() }
}, 30000)
