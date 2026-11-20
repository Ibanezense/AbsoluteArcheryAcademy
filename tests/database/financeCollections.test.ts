import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('preserves the original collection, adjustment and full refund across periods', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() IS NOT NULL $$;
      CREATE TABLE students(id uuid PRIMARY KEY,full_name text);
      CREATE TABLE student_memberships(id uuid PRIMARY KEY,custom_name text);
      CREATE TABLE student_membership_payments(id uuid PRIMARY KEY,student_id uuid,student_membership_id uuid,paid_at timestamptz,payment_method text,amount numeric,payment_status text,source text);
      CREATE TABLE intro_clients(id uuid PRIMARY KEY,full_name text);
      CREATE TABLE intro_payments(id uuid PRIMARY KEY,intro_client_id uuid,paid_at timestamptz,payment_method text,amount numeric,payment_status text);
      INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
      INSERT INTO students VALUES ('00000000-0000-0000-0000-000000000002','Alumno');
      INSERT INTO student_memberships VALUES ('00000000-0000-0000-0000-000000000003','Plan');
      INSERT INTO student_membership_payments VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',now(),'yape',100,'paid','admin');
    `)
    await db.exec(readFileSync('supabase/migrations/20261120100000_finance_collections.sql', 'utf8'))
    const operation = (kind: string, amount: number | null, request: string) => db.query(
      "SELECT admin_finance_adjust_collection('00000000-0000-0000-0000-000000000004','membership',$1,$2,'cash','Motivo',$3) AS id", [kind, amount, request],
    )
    await expect(operation('adjustment', -20, '00000000-0000-0000-0000-000000000005')).rejects.toThrow('Solo administradores')
    await db.exec("SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false)")
    const first = await operation('adjustment', -20, '00000000-0000-0000-0000-000000000005')
    expect((await operation('adjustment', -20, '00000000-0000-0000-0000-000000000005')).rows).toEqual(first.rows)
    await operation('refund', null, '00000000-0000-0000-0000-000000000006')
    await expect(operation('refund', null, '00000000-0000-0000-0000-000000000007')).rejects.toThrow('ya fue devuelto')
    const result = await db.query("SELECT kind,amount::int,payment_method FROM admin_finance_collections((now() AT TIME ZONE 'America/Lima')::date, (now() AT TIME ZONE 'America/Lima')::date+1) ORDER BY amount DESC")
    expect(result.rows).toEqual([{ kind: 'collection', amount: 100, payment_method: 'yape' }, { kind: 'adjustment', amount: -20, payment_method: 'yape' }, { kind: 'refund', amount: -80, payment_method: 'cash' }])
  } finally { await db.close() }
}, 30000)
