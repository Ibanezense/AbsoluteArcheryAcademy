import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('reports overlapping reservations by site without treating unknown bows as available', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() = '00000000-0000-0000-0000-000000000099'::uuid $$;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.academy_locations(id uuid PRIMARY KEY, code text, name text);
      CREATE TABLE public.sessions(id uuid PRIMARY KEY, location_id uuid, start_at timestamptz, end_at timestamptz, status text);
      CREATE TABLE public.bookings(id uuid PRIMARY KEY, session_id uuid, status text, bow_usage_type text, student_id uuid, intro_client_id uuid);
    `)
    await db.exec(readFileSync('supabase/migrations/20261119182253_admin_dashboard_site_capacity.sql', 'utf8'))
    await db.exec(`
      INSERT INTO academy_locations VALUES ('00000000-0000-0000-0000-000000000001','umacollo','Umacollo'), ('00000000-0000-0000-0000-000000000002','tiabaya','Tiabaya');
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',now()+interval '1 day',now()+interval '1 day 1 hour','scheduled'), ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',now()+interval '1 day',now()+interval '1 day 1 hour','scheduled');
      INSERT INTO bookings VALUES ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011','reserved','own','00000000-0000-0000-0000-000000000031',null), ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000011','reserved',null,null,'00000000-0000-0000-0000-000000000032'), ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000012','reserved','own','00000000-0000-0000-0000-000000000033',null), ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012','reserved','assigned','00000000-0000-0000-0000-000000000034',null);
    `)
    await expect(db.query('select * from public.admin_dashboard_site_capacity()')).rejects.toThrow('No autorizado')
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false)")
    const result = await db.query<any>('select * from public.admin_dashboard_site_capacity() order by location_code')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ location_code: 'tiabaya', occupied_people: 2, academy_bows_in_use: 1, unknown_bow_usage: 0 })
    expect(result.rows[1]).toMatchObject({ location_code: 'umacollo', occupied_people: 2, academy_bows_in_use: 1, unknown_bow_usage: 0 })
    await db.exec(`
      INSERT INTO sessions VALUES ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000002',now()+interval '1 day 30 minutes',now()+interval '1 day 90 minutes','scheduled');
      INSERT INTO bookings VALUES ('00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000013','reserved',null,'00000000-0000-0000-0000-000000000035',null);
    `)
    const overlap = await db.query<any>("select * from public.admin_dashboard_site_capacity() where session_id='00000000-0000-0000-0000-000000000012'")
    expect(overlap.rows[0]).toMatchObject({ occupied_people: 3, academy_bows_in_use: 1, unknown_bow_usage: 1 })
  } finally { await db.close() }
}, 30000)
