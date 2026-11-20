import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const readSql = (path: string) => readFileSync(path, 'utf8')
const migration = (name: string) => readSql(`supabase/migrations/${name}.sql`)
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

it('caps simultaneous trial reservations by site and exposes the same limit in the calendar', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.academy_locations(id uuid PRIMARY KEY, code text);
      CREATE TABLE public.sessions(id uuid PRIMARY KEY, location_id uuid, start_at timestamptz, end_at timestamptz, status text);
      CREATE TABLE public.intro_clients(id uuid PRIMARY KEY);
      CREATE TABLE public.bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid, status text, bow_usage_type text, intro_client_id uuid);
      CREATE FUNCTION public.get_multisite_session_availability(
        p_session_id uuid, p_student_id uuid DEFAULT NULL, p_is_intro boolean DEFAULT false, p_exclude_booking_id uuid DEFAULT NULL
      ) RETURNS jsonb LANGUAGE sql AS $$
        SELECT jsonb_build_object('location_code', l.code, 'physical_spots_remaining', CASE WHEN l.code = 'tiabaya' THEN 0 ELSE 4 END,
          'shared_bows_remaining', 2, 'available', l.code <> 'tiabaya', 'message', 'legacy')
        FROM public.sessions s JOIN public.academy_locations l ON l.id = s.location_id WHERE s.id = p_session_id
      $$;
      CREATE FUNCTION public.intro_calendar_spots(p_session_id uuid, p_exclude_booking_id uuid DEFAULT NULL)
      RETURNS integer LANGUAGE plpgsql AS $$
      BEGIN
        RETURN (public.get_multisite_session_availability(p_session_id,NULL,true,p_exclude_booking_id)->>'physical_spots_remaining')::integer;
      END; $$;
      CREATE FUNCTION public.admin_get_intro_calendar(p_date_from date, p_date_to date, p_location_id uuid DEFAULT NULL)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        RETURN (SELECT jsonb_agg(jsonb_build_object('session_id', s.id, 'available', public.intro_calendar_spots(s.id))) FROM public.sessions s);
      END; $$;
      INSERT INTO public.academy_locations VALUES ('${id(1)}', 'umacollo'), ('${id(2)}', 'tiabaya');
      INSERT INTO public.sessions VALUES
        ('${id(11)}', '${id(1)}', '2030-01-01 13:00Z', '2030-01-01 14:00Z', 'scheduled'),
        ('${id(12)}', '${id(2)}', '2030-01-01 13:00Z', '2030-01-01 14:00Z', 'scheduled'),
        ('${id(13)}', '${id(2)}', '2030-01-01 13:00Z', '2030-01-01 13:30Z', 'scheduled'),
        ('${id(14)}', '${id(2)}', '2030-01-01 13:30Z', '2030-01-01 14:00Z', 'scheduled');
      INSERT INTO public.bookings(session_id, status, bow_usage_type)
      SELECT '${id(11)}'::uuid, 'reserved', 'own' FROM generate_series(1, 4)
      UNION ALL SELECT '${id(12)}'::uuid, 'reserved', 'own' FROM generate_series(1, 10)
      UNION ALL SELECT '${id(13)}'::uuid, 'reserved', 'assigned' FROM generate_series(1, 5)
      UNION ALL SELECT '${id(14)}'::uuid, 'reserved', 'shared_inventory' FROM generate_series(1, 5);
    `)
    await db.exec(migration('20261120031500_intro_site_availability'))
    const before = await db.query<{ slot: { session_id: string; available: number; academy_remaining: number } }>(`
      SELECT jsonb_array_elements(public.admin_get_intro_calendar('2030-01-01','2030-01-01')) AS slot
    `)
    expect(before.rows.map(row => row.slot).find(row => row.session_id === id(12))).toMatchObject({ available: 1, academy_remaining: 1 })
    const resources = await db.query(`SELECT public.get_multisite_session_availability('${id(12)}', NULL, true) AS availability`)
    expect(resources.rows).toEqual([{ availability: { location_code: 'tiabaya', physical_capacity: 6, physical_spots_remaining: 1, shared_bows_remaining: 2, available: true, message: 'Cupo disponible' } }])
    await expect(db.query(`INSERT INTO bookings(session_id,status,intro_client_id) VALUES ('${id(11)}','reserved','${id(90)}')`)).rejects.toThrow('no tiene cupo disponible')
    await db.exec(`INSERT INTO bookings(session_id,status,intro_client_id) VALUES ('${id(12)}','reserved','${id(90)}')`)
    await expect(db.query(`INSERT INTO bookings(session_id,status,intro_client_id) VALUES ('${id(14)}','reserved','${id(91)}')`)).rejects.toThrow('no tiene cupo disponible')
    await expect(db.query(`INSERT INTO bookings(session_id,status,bow_usage_type) VALUES ('${id(14)}','reserved','assigned')`)).rejects.toThrow('no tiene arcos')
    await db.exec(`INSERT INTO bookings(session_id,status,bow_usage_type) VALUES ('${id(14)}','reserved','own')`)
    const remaining = await db.query(`SELECT public.intro_calendar_spots('${id(12)}') AS available`)
    expect(remaining.rows).toEqual([{ available: 0 }])
  } finally {
    await db.close()
  }
}, 30000)

it('links only attended trials, before a membership exists, and keeps retries idempotent', async () => {
  const db = new PGlite()
  try {
    await db.exec(readSql('tests/supabase/adminTrialConversion.bootstrap.sql'))
    await db.exec(migration('20261019143009_admin_trial_student_conversions'))
    await db.exec(migration('20261120031600_intro_enrollment'))
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('${id(1)}'), ('${id(2)}');
      INSERT INTO profiles(id,role) VALUES ('${id(1)}','admin'), ('${id(2)}','student');
      INSERT INTO sessions(id,start_at) VALUES ('${id(3)}',now()-interval '1 day');
      INSERT INTO intro_clients(id,full_name) VALUES ('${id(4)}','Prueba');
      INSERT INTO students(id,full_name) VALUES ('${id(5)}','Alumno');
      INSERT INTO bookings(id,intro_client_id,session_id,status) VALUES ('${id(6)}','${id(4)}','${id(3)}','reserved');
      SELECT set_config('request.jwt.claim.sub','${id(2)}',false);
    `)
    const link = () => db.query(`SELECT public.link_attended_intro_student('${id(6)}','${id(5)}') AS id`)
    await expect(link()).rejects.toThrow('Solo administradores')
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${id(1)}',false)`)
    await expect(link()).rejects.toThrow('prueba asistida')
    await db.exec(`UPDATE bookings SET status='attended' WHERE id='${id(6)}'`)
    const first = await link()
    expect(first.rows).toHaveLength(1)
    expect((await link()).rows).toEqual(first.rows)
    expect((await db.query('SELECT count(*)::integer AS count FROM intro_student_conversion_events')).rows).toEqual([{ count: 1 }])
    await expect(db.query(`SELECT public.confirm_intro_student_conversion('${id(4)}','${id(5)}')`)).rejects.toThrow('primera membresía')
  } finally {
    await db.close()
  }
}, 30000)

it('keeps the optional DNI on retry and lets an administrator clear it', async () => {
  const db = new PGlite()
  try {
    await db.exec(readSql('tests/supabase/adminTrialConversion.bootstrap.sql'))
    await db.exec(`
      ALTER TABLE public.intro_clients ADD COLUMN dni text;
      CREATE TABLE public.intro_appointment_events(request_id uuid UNIQUE);
      CREATE FUNCTION public.admin_register_intro_appointment(text, integer, text, uuid, numeric, text, text, text, text, boolean, uuid)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO public.intro_appointment_events VALUES ($11) ON CONFLICT DO NOTHING;
        RETURN jsonb_build_object('success', true, 'intro_client_id', '${id(3)}');
      END; $$;
      CREATE FUNCTION public.admin_change_intro_appointment(uuid, timestamptz, text, uuid, text, jsonb)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"success":true}'::jsonb $$;
      INSERT INTO auth.users(id) VALUES ('${id(1)}');
      INSERT INTO profiles(id,role) VALUES ('${id(1)}','admin');
      INSERT INTO intro_clients(id,full_name) VALUES ('${id(3)}','Prueba');
      INSERT INTO bookings(id,intro_client_id,status) VALUES ('${id(4)}','${id(3)}','reserved');
    `)
    await db.exec(migration('20261120031700_intro_appointment_dni'))
    const register = (dni: string) => db.query(`SELECT public.admin_register_intro_appointment_with_dni(
      'Prueba', 28, NULL, '${id(5)}', 0, 'not_applicable', 'free', 'not_applicable', NULL, false, '${id(6)}', $1)`, [dni])
    const document = () => db.query('SELECT dni FROM intro_clients')
    await expect(register('01234567')).rejects.toThrow('Solo administradores')
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${id(1)}',false)`)
    await expect(register('123')).rejects.toThrow('ocho dígitos')
    await register('01234567')
    await register('87654321')
    expect((await document()).rows).toEqual([{ dni: '01234567' }])
    await db.query(`SELECT public.admin_change_intro_appointment_with_dni('${id(4)}', now(), 'edit', NULL, NULL, '{"dni":""}')`)
    expect((await document()).rows).toEqual([{ dni: null }])
  } finally {
    await db.close()
  }
}, 30000)
