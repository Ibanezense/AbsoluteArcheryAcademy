import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('limits renewal followups by Lima date, student status, and future renewal', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() = '00000000-0000-0000-0000-000000000099'::uuid $$;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.students(id uuid PRIMARY KEY, full_name text, operational_status text);
      CREATE TABLE public.student_memberships(id uuid, student_id uuid, start_date date, end_date date, status text);
    `)
    await db.exec(readFileSync('supabase/migrations/20261119182942_admin_dashboard_membership_followups.sql', 'utf8'))
    await db.exec(`
      INSERT INTO students SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'Alumno ' || n, CASE WHEN n=6 THEN 'inactive' WHEN n=2 THEN 'paused' WHEN n=3 THEN 'expired' ELSE 'active' END FROM generate_series(1,7) n;
      INSERT INTO student_memberships SELECT gen_random_uuid(), s.id, (now() AT TIME ZONE 'America/Lima')::date - 60,
        (now() AT TIME ZONE 'America/Lima')::date + CASE n WHEN 1 THEN 7 WHEN 2 THEN -30 WHEN 3 THEN -31 WHEN 4 THEN 8 WHEN 5 THEN -1 WHEN 6 THEN -1 ELSE 0 END,
        CASE WHEN n IN (2,3,5,6) THEN 'expired' ELSE 'active' END
        FROM students s CROSS JOIN LATERAL (SELECT right(s.full_name,1)::int n) x;
      INSERT INTO student_memberships SELECT gen_random_uuid(), id, (now() AT TIME ZONE 'America/Lima')::date + 10, (now() AT TIME ZONE 'America/Lima')::date + 40, 'active' FROM students WHERE full_name='Alumno 5';
    `)
    await expect(db.query('select * from public.admin_dashboard_membership_followups()')).rejects.toThrow('No autorizado')
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false)")
    const result = await db.query<{ full_name: string; category: string }>('select * from public.admin_dashboard_membership_followups()')
    expect(result.rows.map(row => row.full_name).sort()).toEqual(['Alumno 1','Alumno 2','Alumno 7'])
    expect(result.rows.find(row => row.full_name === 'Alumno 2')?.category).toBe('expired')
    expect(result.rows.find(row => row.full_name === 'Alumno 7')?.category).toBe('expiring')
  } finally { await db.close() }
}, 30000)
