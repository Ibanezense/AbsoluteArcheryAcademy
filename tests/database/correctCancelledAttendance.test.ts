import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('corrects cancelled attendance once, including a finalized cycle, and rejects non-admins', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$SELECT auth.uid()='00000000-0000-0000-0000-000000000001'::uuid$$;
      CREATE FUNCTION public.can_access_student(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
      CREATE TYPE booking_status AS ENUM ('reserved','cancelled','attended','no_show');
      CREATE TABLE students(id uuid PRIMARY KEY);
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE sessions(id uuid PRIMARY KEY,start_at timestamptz);
      CREATE TABLE student_memberships(id uuid PRIMARY KEY,student_id uuid,classes_remaining int,classes_used int,unused_classes_finalized_at timestamptz,end_date date,updated_at timestamptz,start_date date);
      CREATE TABLE bookings(id uuid PRIMARY KEY,student_id uuid,session_id uuid,active_membership_id uuid,status booking_status,credit_kind text,recovery_credit_id uuid,attendance_marked_by uuid,attendance_marked_at timestamptz,updated_at timestamptz,admin_notes text);
      CREATE TABLE booking_cancellations(id uuid PRIMARY KEY,booking_id uuid,student_id uuid,cancellation_source text,review_status text,resolution text);
      CREATE TABLE membership_class_expirations(id uuid PRIMARY KEY,student_id uuid,student_membership_id uuid,normal_classes int,recovery_classes int,expired_at timestamptz);
      CREATE TABLE membership_recovery_credits(id uuid PRIMARY KEY,student_id uuid,student_membership_id uuid,classes_granted int,classes_remaining int,updated_at timestamptz);
      CREATE TABLE student_credit_ledger(id uuid DEFAULT gen_random_uuid(),student_id uuid,student_membership_id uuid,booking_id uuid,movement_type text,delta int,balance_after int,reason text,performed_by_profile_id uuid);
      CREATE FUNCTION public.sync_student_membership_operational_status(uuid) RETURNS integer LANGUAGE sql AS $$SELECT 0$$;
      INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001');
      INSERT INTO students VALUES ('00000000-0000-0000-0000-000000000002');
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000003',now()-interval '2 days');
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000009',now()-interval '3 days');
      INSERT INTO student_memberships VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002',2,0,NULL,current_date+1,now(),current_date-10);
      INSERT INTO student_memberships VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',0,0,now(),current_date-1,now(),current_date-10);
      INSERT INTO membership_class_expirations VALUES ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005',1,0,now());
      INSERT INTO bookings(id,student_id,session_id,active_membership_id,status,credit_kind) VALUES
       ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','cancelled','normal'),
       ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000005','cancelled','normal');
    `)
    await db.exec(readFileSync('supabase/migrations/20261109150401_correct_cancelled_attendance.sql', 'utf8'))
    expect((await db.query("SELECT has_function_privilege('anon','public.admin_correct_cancelled_attendance(uuid)','EXECUTE') allowed")).rows[0]).toEqual({allowed:false})
    expect((await db.query("SELECT has_table_privilege('authenticated','public.attendance_expiration_corrections','INSERT') allowed")).rows[0]).toEqual({allowed:false})
    await db.exec("SELECT set_config('test.actor','00000000-0000-0000-0000-000000000002',false)")
    await db.exec('SET ROLE authenticated')
    await expect(db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000007')")).rejects.toThrow('administrador')
    await db.exec("SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false)")
    await db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000007')")
    await db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000007')")
    await db.exec('RESET ROLE')
    expect((await db.query("SELECT classes_remaining,classes_used FROM student_memberships WHERE id='00000000-0000-0000-0000-000000000004'")).rows[0]).toEqual({classes_remaining:1,classes_used:1})
    await db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000008')")
    expect((await db.query('SELECT count(*)::int n FROM attendance_expiration_corrections')).rows[0]).toEqual({n:1})
    expect((await db.query("SELECT sum(delta)::int n FROM student_credit_ledger WHERE booking_id='00000000-0000-0000-0000-000000000008'")).rows[0]).toEqual({n:0})
    expect((await db.query("SELECT status FROM bookings WHERE id='00000000-0000-0000-0000-000000000008'")).rows[0]).toEqual({status:'attended'})
    await db.exec(`
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000010',now()-interval '4 days'),('00000000-0000-0000-0000-000000000011',now()+interval '1 day');
      INSERT INTO bookings(id,student_id,session_id,active_membership_id,status,credit_kind) VALUES
        ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000005','cancelled','normal'),
        ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000004','cancelled','normal'),
        ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000004','cancelled','normal');
    `)
    await expect(db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000012')")).rejects.toThrow('No hay clases vencidas disponibles')
    await expect(db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000013')")).rejects.toThrow('ya comenzaron')
    await db.exec("INSERT INTO booking_cancellations VALUES ('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000002','student','pending',NULL)")
    await expect(db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000014')")).rejects.toThrow('requiere revisión')
    await db.exec(`
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000024',now()+interval '1 day');
      INSERT INTO bookings(id,student_id,session_id,active_membership_id,status,credit_kind) VALUES
        ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000004','cancelled','normal'),
        ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000004','reserved','normal');
    `)
    await expect(db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000022')")).rejects.toThrow('sin comprometer otras reservas')
    await db.exec("UPDATE bookings SET session_id='00000000-0000-0000-0000-000000000010' WHERE id='00000000-0000-0000-0000-000000000023'")
    await expect(db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000022')")).rejects.toThrow('Ya existe una reserva o asistencia')
    await db.exec("UPDATE bookings SET status='cancelled' WHERE id='00000000-0000-0000-0000-000000000023'")
    await db.exec(`
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000016',now()-interval '5 days'),('00000000-0000-0000-0000-000000000017',now()-interval '6 days');
      INSERT INTO membership_recovery_credits VALUES ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004',1,1,now()),
        ('00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005',1,0,now());
      UPDATE membership_class_expirations SET recovery_classes=1;
      INSERT INTO bookings(id,student_id,session_id,active_membership_id,status,credit_kind,recovery_credit_id) VALUES
        ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000004','cancelled','recovery','00000000-0000-0000-0000-000000000018'),
        ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000005','cancelled','recovery','00000000-0000-0000-0000-000000000019');
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000025',now()-interval '7 days');
      INSERT INTO bookings(id,student_id,session_id,active_membership_id,status,credit_kind,recovery_credit_id) VALUES
        ('00000000-0000-0000-0000-000000000026','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000005','no_show','recovery','00000000-0000-0000-0000-000000000019');
      INSERT INTO student_credit_ledger(booking_id,movement_type,delta) VALUES
        ('00000000-0000-0000-0000-000000000026','recovery_consumed',-1),
        ('00000000-0000-0000-0000-000000000026','no_show_reversal_refund',1);
    `)
    await db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000020')")
    await db.query("SELECT public.admin_correct_cancelled_attendance('00000000-0000-0000-0000-000000000021')")
    expect((await db.query("SELECT classes_remaining FROM membership_recovery_credits WHERE id='00000000-0000-0000-0000-000000000018'")).rows[0]).toEqual({classes_remaining:0})
    expect((await db.query("SELECT count(*)::int n FROM attendance_expiration_corrections WHERE credit_kind='recovery'")).rows[0]).toEqual({n:1})
  } finally { await db.close() }
},30000)
