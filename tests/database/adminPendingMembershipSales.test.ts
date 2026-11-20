import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('creates complete pending charges without a collection date and never resets a collected payment on retry', async () => {
  const db = new PGlite()
  const student = '00000000-0000-0000-0000-000000000001'
  const batch = '00000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() = '${student}' $$;
      CREATE TABLE public.student_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, assignment_batch_id uuid, start_date date, total_amount numeric(10,2), status text);
      CREATE TABLE public.student_membership_payments(student_membership_id uuid, amount numeric(10,2), payment_status text, paid_at timestamptz NOT NULL, notes text);
      CREATE FUNCTION public.admin_create_student_membership_cycles(uuid,uuid,date,integer,text,integer,date,numeric,numeric,text,text,numeric,text,date,uuid,uuid[],integer,text,uuid)
      RETURNS SETOF public.student_memberships LANGUAGE plpgsql AS $$
      BEGIN
        WITH cycles AS (
          INSERT INTO public.student_memberships(student_id, assignment_batch_id, start_date, total_amount, status)
          SELECT $1, $15, $3 + (n-1)*30, $8, 'active' FROM generate_series(1,$4) n RETURNING id
        )
        INSERT INTO public.student_membership_payments(student_membership_id, amount, payment_status, paid_at)
        SELECT id, $9, 'pending', now() FROM cycles;
        RETURN QUERY SELECT * FROM public.student_memberships WHERE assignment_batch_id=$15;
      END $$;
    `)
    await db.exec(readFileSync('supabase/migrations/20261120031900_admin_pending_membership_sales.sql', 'utf8'))
    const sale = () => db.query(`SELECT id,status FROM public.admin_create_pending_membership_cycles(
      '${student}',NULL,'2026-11-19',2,'paid',NULL,NULL,120,0,NULL,NULL,NULL,NULL,NULL,'${batch}','{}',0,NULL,NULL)`)
    await expect(sale()).rejects.toThrow('Solo administradores')
    await db.exec(`SELECT set_config('test.actor','${student}',false)`)
    const created = await sale()
    expect(created.rows).toHaveLength(2)
    expect(created.rows.every(row => (row as { status: string }).status === 'active')).toBe(true)
    const charges = () => db.query('SELECT amount::text,payment_status,paid_at FROM student_membership_payments ORDER BY payment_status, student_membership_id')
    expect((await charges()).rows).toEqual(Array.from({ length: 2 }, () => ({ amount: '120.00', payment_status: 'pending', paid_at: null })))
    await db.query("UPDATE student_membership_payments SET payment_status='paid',paid_at='2026-11-23T12:00:00-05:00' WHERE student_membership_id=$1", [(created.rows[0] as { id: string }).id])
    expect((await sale()).rows).toEqual(created.rows)
    expect((await charges()).rows).toEqual([
      { amount: '120.00', payment_status: 'paid', paid_at: new Date('2026-11-23T17:00:00Z') },
      { amount: '120.00', payment_status: 'pending', paid_at: null },
    ])
  } finally {
    await db.close()
  }
}, 30000)
