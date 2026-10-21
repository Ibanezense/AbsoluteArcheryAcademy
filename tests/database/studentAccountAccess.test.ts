import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('separates expired/paused membership state from inactive or explicitly blocked account access', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin',true)='true' $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY, role text, is_active boolean);
      CREATE TABLE students(id uuid PRIMARY KEY,self_profile_id uuid REFERENCES profiles(id),operational_status text,is_active boolean,account_access_blocked boolean NOT NULL DEFAULT false,updated_at timestamptz,operational_status_updated_at timestamptz,operational_status_reason text);
      CREATE TABLE student_memberships(id uuid PRIMARY KEY,student_id uuid,status text,classes_remaining integer,end_date date);
    `)
    await db.exec(readFileSync('supabase/migrations/20260829012228_admin_manual_student_inactive.sql', 'utf8'))
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    const states = ['expired', 'paused', 'inactive', 'blocked', 'suspended', 'retired', 'withdrawn', 'active', 'paused']
    for (const [index, status] of states.entries()) {
      const n = index + 1
      await db.query('INSERT INTO profiles VALUES($1,$2,$3)', [id(n), 'student', !['expired', 'paused'].includes(status)])
      await db.query('INSERT INTO students(id,self_profile_id,operational_status,is_active,account_access_blocked) VALUES($1,$1,$2,false,$3)', [id(n), status, n === 9])
      await db.query('INSERT INTO student_memberships VALUES($1,$1,$2,0,$3)', [id(n), 'expired', '2026-10-15'])
    }
    await db.query('INSERT INTO profiles VALUES($1,$2,false)', [id(10), 'guardian'])
    const before = await db.query('SELECT * FROM student_memberships ORDER BY id')
    const migration = readFileSync('supabase/migrations/20261021191039_student_account_access_policy.sql', 'utf8')
    await db.exec(migration)
    const rows = await db.query<{ is_active: boolean }>('SELECT is_active FROM profiles ORDER BY id')
    expect(rows.rows.map(r => r.is_active)).toEqual([true, true, false, false, false, false, false, true, false, false])
    expect((await db.query('SELECT * FROM student_memberships ORDER BY id')).rows).toEqual(before.rows)
    expect((await db.query('SELECT is_active FROM students WHERE id=$1', [id(1)])).rows[0]).toEqual({ is_active: false })
    await db.query("UPDATE students SET operational_status='inactive' WHERE id=$1", [id(1)])
    expect((await db.query('SELECT is_active FROM profiles WHERE id=$1', [id(1)])).rows[0]).toEqual({ is_active: false })
    await db.query("UPDATE students SET operational_status='paused' WHERE id=$1", [id(1)])
    expect((await db.query('SELECT is_active FROM profiles WHERE id=$1', [id(1)])).rows[0]).toEqual({ is_active: true })
    await db.query('UPDATE students SET account_access_blocked=true WHERE id=$1', [id(1)])
    await db.query("UPDATE students SET operational_status='expired' WHERE id=$1", [id(1)])
    expect((await db.query('SELECT is_active FROM profiles WHERE id=$1', [id(1)])).rows[0]).toEqual({ is_active: false })
    await db.exec(`SELECT set_config('test.actor','${id(99)}',false); SELECT set_config('test.admin','true',false);`)
    await db.query('SELECT public.admin_set_student_inactive($1,true)', [id(2)])
    expect((await db.query('SELECT is_active FROM profiles WHERE id=$1', [id(2)])).rows[0]).toEqual({ is_active: false })
    await expect(db.query('SELECT public.admin_set_student_account_access($1,true)', [id(3)])).rejects.toThrow('inactivo')
    await db.exec("SELECT set_config('test.admin','false',false)")
    await expect(db.query('SELECT public.admin_set_student_account_access($1,true)', [id(2)])).rejects.toThrow('No autorizado')
    expect((await db.query("SELECT has_function_privilege('authenticated','public.sync_student_account_access()','EXECUTE') allowed")).rows[0]).toEqual({ allowed: false })
    await db.exec(migration)
    expect((await db.query('SELECT * FROM student_memberships ORDER BY id')).rows).toEqual(before.rows)
  } finally { await db.close() }
}, 20000)
