import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('lets only administrators regularize a past class once without losing it at day close', async () => {
  const db = new PGlite()
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean DEFAULT true);
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT FROM profiles WHERE id=auth.uid() AND role='admin' AND is_active) $$;
      CREATE TYPE booking_status AS ENUM('reserved','cancelled','attended','no_show');
      CREATE TABLE sessions(id uuid PRIMARY KEY,start_at timestamptz,end_at timestamptz);
      CREATE TABLE student_memberships(id uuid PRIMARY KEY,attendance_policy_started_on date,end_date date,unused_classes_finalized_at timestamptz,classes_used integer DEFAULT 0,classes_remaining integer,updated_at timestamptz);
      CREATE TABLE bookings(id uuid PRIMARY KEY,student_id uuid,session_id uuid,status booking_status,active_membership_id uuid,credit_kind text,recovery_credit_id uuid,booked_by_profile_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz,attendance_marked_by uuid,attendance_marked_at timestamptz,admin_notes text);
      CREATE TABLE membership_recovery_credits(id uuid PRIMARY KEY,classes_remaining integer,updated_at timestamptz);
      CREATE TABLE student_credit_ledger(student_id uuid,student_membership_id uuid,booking_id uuid,movement_type text,delta integer,balance_after integer,reason text,performed_by_profile_id uuid);
      CREATE FUNCTION public.sync_student_membership_operational_status(uuid) RETURNS integer LANGUAGE sql AS $$SELECT 0$$;
      CREATE FUNCTION public.close_pending_booking(p uuid,source text) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN UPDATE bookings SET status='cancelled' WHERE id=p AND status='reserved'; RETURN FOUND; END$$;
    `)
    const base = readFileSync('supabase/migrations/20261011134507_attendance_only_membership_expiry.sql', 'utf8')
    function block(name: string) { const start = base.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`); const end = base.indexOf('CREATE OR REPLACE FUNCTION', start + 1); return base.slice(start, end) }
    await db.exec(block('admin_mark_attendance'))
    await db.exec(block('close_unattended_daily_bookings'))
    await db.query("INSERT INTO profiles VALUES($1,'admin',true),($2,'student',true)", [id(1), id(2)])
    await db.exec(`SELECT set_config('test.actor','${id(1)}',false)`)
    await db.query("INSERT INTO sessions VALUES($1,((now() AT TIME ZONE 'America/Lima')::date-1+time '10:00') AT TIME ZONE 'America/Lima',now()-interval '1 day')", [id(3)])
    await db.query("INSERT INTO student_memberships(id,attendance_policy_started_on,end_date,classes_remaining) VALUES($1,(now() AT TIME ZONE 'America/Lima')::date-3,(now() AT TIME ZONE 'America/Lima')::date+5,4)", [id(4)])
    // A regularization that was already pending when the fix was installed.
    await db.query("INSERT INTO bookings(id,student_id,session_id,status,active_membership_id,booked_by_profile_id) VALUES($1,$2,$3,'reserved',$4,$5)", [id(9), id(2), id(3), id(4), id(1)])
    const migration = 'supabase/migrations/20261022150600_admin_retroactive_attendance.sql'
    await db.exec(readFileSync(migration, 'utf8'))
    expect((await db.query('SELECT admin_retroactive_attendance FROM bookings WHERE id=$1', [id(9)])).rows[0]).toEqual({ admin_retroactive_attendance: true })
    async function book(n: number, actor = 1, created = 'now()') {
      await db.query(`INSERT INTO bookings(id,student_id,session_id,status,active_membership_id,booked_by_profile_id,created_at) VALUES($1,$2,$3,'reserved',$4,$5,${created})`, [id(n), id(2), id(3), id(4), id(actor)])
    }
    await book(10)
    await db.query('SELECT close_unattended_daily_bookings()')
    expect((await db.query('SELECT status FROM bookings WHERE id=$1', [id(10)])).rows[0]).toEqual({ status: 'reserved' })
    await expect(db.query('SELECT admin_mark_attendance($1,false)', [id(10)])).rejects.toThrow('solo se registra asistencia')
    await db.query('SELECT admin_mark_attendance($1,true)', [id(10)])
    await db.query('SELECT admin_mark_attendance($1,true)', [id(10)])
    expect((await db.query('SELECT classes_used,classes_remaining FROM student_memberships')).rows[0]).toEqual({ classes_used: 1, classes_remaining: 3 })
    expect((await db.query('SELECT count(*)::int n FROM student_credit_ledger')).rows[0]).toEqual({ n: 1 })
    expect((await db.query('SELECT attendance_marked_by, attendance_marked_at IS NOT NULL marked, admin_retroactive_attendance FROM bookings WHERE id=$1', [id(10)])).rows[0]).toEqual({ attendance_marked_by: id(1), marked: true, admin_retroactive_attendance: true })
    await book(11, 1, "now()-interval '2 days'")
    await db.query('SELECT close_unattended_daily_bookings()')
    expect((await db.query('SELECT status FROM bookings WHERE id=$1', [id(11)])).rows[0]).toEqual({ status: 'cancelled' })
    await expect(db.query('SELECT admin_mark_attendance($1,true)', [id(11)])).rejects.toThrow('cancelada')
    await book(12)
    await db.exec(`SELECT set_config('test.actor','${id(2)}',false)`)
    await expect(db.query('SELECT admin_mark_attendance($1,true)', [id(12)])).rejects.toThrow('administradores')
    // The broad legacy booking update policy cannot be used to forge the exemption.
    await book(13)
    await db.query('UPDATE bookings SET admin_retroactive_attendance=true WHERE id=$1', [id(13)])
    expect((await db.query('SELECT admin_retroactive_attendance FROM bookings WHERE id=$1', [id(13)])).rows[0]).toEqual({ admin_retroactive_attendance: false })
    await db.query('SELECT close_unattended_daily_bookings()')
    expect((await db.query('SELECT status FROM bookings WHERE id=$1', [id(13)])).rows[0]).toEqual({ status: 'cancelled' })
    expect((await db.query("SELECT has_function_privilege('authenticated','public.set_admin_retroactive_attendance()','execute') allowed")).rows[0]).toEqual({ allowed: false })
    await db.exec(`SELECT set_config('test.actor','${id(1)}',false)`)
    await db.exec('UPDATE student_memberships SET classes_remaining=0')
    await expect(db.query('SELECT admin_mark_attendance($1,true)', [id(12)])).rejects.toThrow('saldo disponible')
    await db.exec('UPDATE student_memberships SET classes_remaining=3')
    // Recovery credits use their own balance and are also consumed only once.
    await db.query('INSERT INTO membership_recovery_credits VALUES($1,1,now())', [id(20)])
    await book(14)
    await db.query("UPDATE bookings SET credit_kind='recovery',recovery_credit_id=$1 WHERE id=$2", [id(20), id(14)])
    await db.query('SELECT admin_mark_attendance($1,true)', [id(14)])
    await db.query('SELECT admin_mark_attendance($1,true)', [id(14)])
    expect((await db.query('SELECT classes_remaining FROM membership_recovery_credits')).rows[0]).toEqual({ classes_remaining: 0 })
    expect((await db.query("SELECT count(*)::int n FROM student_credit_ledger WHERE movement_type='recovery_consumed'")).rows[0]).toEqual({ n: 1 })
    await db.exec("UPDATE student_memberships SET unused_classes_finalized_at=now(),end_date=(now() AT TIME ZONE 'America/Lima')::date-1")
    await expect(db.query('SELECT admin_mark_attendance($1,true)', [id(12)])).rejects.toThrow('venció')
    expect((await db.query('SELECT classes_remaining FROM student_memberships')).rows[0]).toEqual({ classes_remaining: 3 })
  } finally { await db.close() }
}, 20000)
