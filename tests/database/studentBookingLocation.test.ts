import { PGlite } from '@electric-sql/pglite'
import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('limits student and guardian agendas to their site while leaving admin access intact', async () => {
  const db = new PGlite()
  try {
    await db.exec(readFileSync('tests/supabase/studentBookingAgenda.bootstrap.sql', 'utf8'))
    await db.exec(`
      ALTER TABLE students ADD COLUMN home_location_id uuid, ADD COLUMN is_active boolean DEFAULT true;
      ALTER TABLE bookings ADD COLUMN updated_at timestamptz, ADD COLUMN created_at timestamptz, ADD COLUMN user_id uuid, ADD COLUMN booked_by_profile_id uuid, ADD COLUMN booking_source text;
      ALTER TABLE bookings ALTER COLUMN id SET DEFAULT gen_random_uuid();
      CREATE TYPE public.group_type AS ENUM ('ownbow','assigned');
      CREATE FUNCTION public.sync_student_membership_operational_status(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.claim_booking_resources(uuid,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.get_booking_day_cutoff(date) RETURNS timestamptz LANGUAGE sql AS $$ SELECT NULL::timestamptz $$;
      CREATE FUNCTION public.check_session_availability_v3(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"available":true}'::jsonb $$;
    `)
    const core = readFileSync('supabase/migrations/20260915013310_multisite_memberships_core.sql', 'utf8')
    await db.exec(core.slice(core.indexOf('CREATE OR REPLACE FUNCTION public.get_multisite_session_availability('), core.indexOf('CREATE OR REPLACE FUNCTION public.claim_booking_resources(')))
    const status = readFileSync('supabase/migrations/20260829012228_admin_manual_student_inactive.sql', 'utf8')
    await db.exec(status.slice(status.indexOf('CREATE OR REPLACE FUNCTION public.is_student_protected_operational_status('), status.indexOf('CREATE OR REPLACE FUNCTION public.admin_set_student_inactive(')))
    await db.exec(readFileSync('supabase/migrations/20261019201815_student_booking_agenda_and_detail.sql', 'utf8'))
    const migration = 'supabase/migrations/20261111151558_student_booking_home_location.sql'
    if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'))
    await db.exec(`
      INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000099','admin');
      INSERT INTO academy_locations VALUES ('00000000-0000-0000-0000-000000000003','tiabaya','Tiabaya',null,'flexible'),('00000000-0000-0000-0000-000000000004','umacollo','Umacollo',null,'fixed_operational');
      INSERT INTO students(id,self_profile_id,full_name,home_location_id) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Alumno','00000000-0000-0000-0000-000000000004');
      INSERT INTO student_guardians VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013');
      INSERT INTO sessions(id,start_at,end_at,location_id,booking_mode) VALUES ('00000000-0000-0000-0000-000000000021',now()+interval '3 days',now()+interval '3 days 1 hour','00000000-0000-0000-0000-000000000003','flexible'),('00000000-0000-0000-0000-000000000022',now()+interval '3 days',now()+interval '3 days 1 hour','00000000-0000-0000-0000-000000000004','fixed');
      INSERT INTO student_memberships(id,student_id,start_date,end_date,purchase_id) VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',current_date-2,current_date+10,'00000000-0000-0000-0000-000000000006');
    `)
    const agenda = () => db.query<{location_code: string}>("SELECT location_code FROM get_student_booking_agenda('00000000-0000-0000-0000-000000000001',current_date,current_date+7)")
    await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',false)")
    expect((await agenda()).rows.map(x => x.location_code)).toEqual(['umacollo'])
    await expect(db.query("SELECT book_session_multisite('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001')")).rejects.toThrow('Solo puedes reservar en la sede asignada')
    await expect(db.query("SELECT book_session('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001')")).rejects.toThrow('Solo puedes reservar en la sede asignada')
    await db.query("SELECT book_session_multisite('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000001')")
    const booking = await db.query<{id: string}>('SELECT id FROM bookings')
    await expect(db.query("SELECT update_booking_session($1,'00000000-0000-0000-0000-000000000021')", [booking.rows[0].id])).rejects.toThrow('Solo puedes reservar en la sede asignada')
    await expect(db.query("UPDATE bookings SET session_id='00000000-0000-0000-0000-000000000021' WHERE id=$1", [booking.rows[0].id])).rejects.toThrow('Solo puedes reservar en la sede asignada')
    await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false)")
    expect((await agenda()).rows.map(x => x.location_code)).toEqual(['umacollo'])
    await expect(db.query("SELECT book_session_multisite('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001')")).rejects.toThrow('Solo puedes reservar en la sede asignada')
    await db.exec("UPDATE students SET home_location_id='00000000-0000-0000-0000-000000000003'")
    expect((await agenda()).rows.map(x => x.location_code)).toEqual(['tiabaya'])
    await expect(db.query("SELECT book_session_multisite('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000001')")).rejects.toThrow('Solo puedes reservar en la sede asignada')
    await db.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [booking.rows[0].id])
    await db.query("UPDATE bookings SET status='reserved' WHERE id=$1", [booking.rows[0].id])
    await db.exec('UPDATE students SET home_location_id=NULL')
    await expect(agenda()).rejects.toThrow('Tu sede no está asignada')
    await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false)")
    expect((await agenda()).rows.map(x => x.location_code).sort()).toEqual(['tiabaya', 'umacollo'])
    await db.query("SELECT update_booking_session($1,'00000000-0000-0000-0000-000000000021')", [booking.rows[0].id])
    await db.exec("DELETE FROM bookings; UPDATE students SET home_location_id='00000000-0000-0000-0000-000000000003'")
    await db.query("SELECT book_session_multisite('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000001')")
  } finally { await db.close() }
}, 30000)
