import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('lists today and tomorrow for enrolled statuses while rejecting non-admins', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() = '00000000-0000-0000-0000-000000000099'::uuid $$;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.students(id uuid, full_name text, phone text, date_of_birth date, operational_status text);
    `)
    await db.exec(readFileSync('supabase/migrations/20261119182756_admin_dashboard_birthdays.sql', 'utf8'))
    await db.exec(`
      INSERT INTO students VALUES
        ('00000000-0000-0000-0000-000000000001','Activo',null,(now() AT TIME ZONE 'America/Lima')::date,'active'),
        ('00000000-0000-0000-0000-000000000002','Pausado',null,(now() AT TIME ZONE 'America/Lima')::date + 1,'paused'),
        ('00000000-0000-0000-0000-000000000003','Vencido',null,(now() AT TIME ZONE 'America/Lima')::date,'expired'),
        ('00000000-0000-0000-0000-000000000004','Retirado',null,(now() AT TIME ZONE 'America/Lima')::date,'inactive');
    `)
    await expect(db.query('select * from public.admin_dashboard_birthdays()')).rejects.toThrow('No autorizado')
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false)")
    const result = await db.query<{ full_name: string; day_offset: number }>('select * from public.admin_dashboard_birthdays()')
    expect(result.rows.map(row => row.full_name).sort()).toEqual(['Activo', 'Pausado', 'Vencido'])
    expect(result.rows.find(row => row.full_name === 'Pausado')?.day_offset).toBe(1)
  } finally { await db.close() }
}, 30000)
