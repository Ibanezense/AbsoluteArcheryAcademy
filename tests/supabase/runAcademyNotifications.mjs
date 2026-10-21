import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(new URL('../../output/postgres-test/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href)
const db = await PGlite.create()
const admin = '10000000-0000-0000-0000-000000000001'
const alice = '10000000-0000-0000-0000-000000000002'
const bob = '10000000-0000-0000-0000-000000000003'
const guardian = '10000000-0000-0000-0000-000000000004'
const s1 = '20000000-0000-0000-0000-000000000001'
const s2 = '20000000-0000-0000-0000-000000000002'
let assertions = 0
async function check(value, expected) { assert.deepEqual(value, expected); assertions++ }
async function actor(id, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id || ''])
  await db.exec(`SET ROLE ${role}`)
}
async function rpc(name, args = []) {
  return (await db.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS result`, args)).rows[0].result
}
async function denied(name, args) {
  await assert.rejects(() => rpc(name, args)); assertions++
}
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean DEFAULT true);
    CREATE TABLE students(id uuid PRIMARY KEY,self_profile_id uuid);
    CREATE TABLE student_guardians(student_id uuid,guardian_profile_id uuid);
    CREATE TABLE student_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,status text,start_date date,created_at timestamptz DEFAULT now());
    CREATE FUNCTION is_admin_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND coalesce(is_active,true))$$;
    CREATE FUNCTION can_access_student(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT is_admin_user() OR EXISTS(SELECT 1 FROM students WHERE id=s AND self_profile_id=auth.uid()) OR EXISTS(SELECT 1 FROM student_guardians WHERE student_id=s AND guardian_profile_id=auth.uid())$$;
    INSERT INTO profiles VALUES('${admin}','admin',true),('${alice}','student',true),('${bob}','student',true),('${guardian}','guardian',true);
    INSERT INTO students VALUES('${s1}','${alice}'),('${s2}','${bob}');
    INSERT INTO student_guardians VALUES('${s1}','${guardian}');
    INSERT INTO student_memberships(student_id,status,start_date) VALUES('${s1}','expired',current_date-30);`)
  const migration = readFileSync('supabase/migrations/20261021024214_academy_notifications.sql', 'utf8')
  await db.exec(migration)
  await db.exec(migration) // additive migration is repeatable
  await actor(admin)
  const draft = await rpc('admin_create_academy_notification', ['Entrena', 'Nos vemos', 'selected', [s1], null, false])
  await actor(alice)
  await check((await rpc('get_student_notification_feed', [s1])).notices.length, 0)
  await check((await rpc('get_student_notification_feed', [s1])).membership.expired, true)
  await denied('get_student_notification_feed', [s2])
  await denied('admin_create_academy_notification', ['Fake', 'Hola', 'all', [], null, true])
  await denied('admin_set_academy_notification_status', [draft, 'published'])
  await actor(admin)
  await denied('admin_create_academy_notification', [' ', 'Hola', 'all', [], null, true])
  await denied('admin_create_academy_notification', ['Hola', 'Hola', 'selected', [], null, true])
  await denied('admin_create_academy_notification', ['Hola', 'Hola', 'selected', ['99999999-0000-0000-0000-000000000001'], null, true])
  await rpc('admin_set_academy_notification_status', [draft, 'published'])
  await actor(bob)
  await check((await rpc('get_student_notification_feed', [s2])).notices.length, 0)
  await denied('dismiss_academy_notification', [s2, draft])
  await actor(guardian)
  await check((await rpc('get_student_notification_feed', [s1])).notices[0].title, 'Entrena')
  await denied('get_student_notification_feed', [s2])
  await actor(alice)
  await rpc('dismiss_academy_notification', [s1, draft])
  await rpc('dismiss_academy_notification', [s1, draft])
  await check((await rpc('get_student_notification_feed', [s1])).notices.length, 0)
  await check((await db.query('SELECT * FROM academy_notifications')).rows.length, 0)
  await assert.rejects(() => db.query("INSERT INTO academy_notification_dismissals(student_id,notification_id,closed_by) VALUES($1,$2,$3)", [s2, draft, alice])); assertions++
  await actor(admin)
  const general = await rpc('admin_create_academy_notification', ['Todos', 'Hola', 'all', [], null, true])
  await check((await rpc('admin_list_academy_notifications')).length, 2)
  await actor(bob)
  await check((await rpc('get_student_notification_feed', [s2])).notices[0].id, general)
  await actor(admin)
  const limited = await rpc('admin_create_academy_notification', ['Temporal', 'Hola', 'all', [], '2099-01-01T05:00:00Z', true])
  await db.exec('RESET ROLE')
  await db.query("UPDATE academy_notifications SET expires_at=now()-interval '1 second' WHERE id=$1", [limited])
  await actor(alice)
  await check((await rpc('get_student_notification_feed', [s1])).notices.some(n => n.id === limited), false)
  await denied('dismiss_academy_notification', [s1, limited])
  await actor(admin)
  await rpc('admin_set_academy_notification_status', [general, 'inactive'])
  await denied('admin_set_academy_notification_status', [general, 'published'])
  await actor(bob)
  await check((await rpc('get_student_notification_feed', [s2])).notices.length, 0)
  await actor(null, 'anon')
  await denied('get_student_notification_feed', [s1])
  await denied('admin_list_academy_notifications', [])
  await assert.rejects(() => db.query('SELECT * FROM academy_notifications')); assertions++
  await actor(admin)
  await db.exec('RESET ROLE')
  await db.exec(`INSERT INTO student_memberships(student_id,status,start_date) VALUES('${s1}','active',current_date);`)
  await actor(alice)
  await check((await rpc('get_student_notification_feed', [s1])).membership.expired, false)
  await actor(guardian)
  await check((await rpc('get_student_notification_feed', [s1])).notices.some(n => n.id === draft), false)
  await db.exec('RESET ROLE')
  await db.exec(`UPDATE profiles SET is_active=false WHERE id='${alice}'`)
  await actor(alice)
  await denied('get_student_notification_feed', [s1])
  await db.exec('RESET ROLE')
  await db.exec(`UPDATE profiles SET is_active=false WHERE id='${admin}'`)
  await actor(admin)
  await denied('admin_list_academy_notifications', [])
  console.log(`${assertions} PostgreSQL notification assertions passed (roles, targeting, expiration, idempotency, active membership)`)
} finally { await db.close() }
