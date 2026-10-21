import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(new URL('../../output/postgres-test/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href)
const db = await PGlite.create()
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION admin_assign_membership_plan(p_start_date date) RETURNS date LANGUAGE plpgsql AS $$DECLARE v_start_date date:=p_start_date;v_end_date date;v_plan record;BEGIN SELECT 30 AS duration_days INTO v_plan;v_end_date := v_start_date + (v_plan.duration_days - 1);RETURN v_end_date;END$$;
    CREATE FUNCTION admin_approve_membership_renewal_request(p_start_date date) RETURNS date LANGUAGE plpgsql AS $$DECLARE v_start_date date:=p_start_date;v_end_date date;v_plan record;BEGIN SELECT 30 AS duration_days INTO v_plan;v_end_date := v_start_date + (v_plan.duration_days - 1);RETURN v_end_date;END$$;
    CREATE FUNCTION admin_create_student_membership_cycles(p_start_date date) RETURNS date LANGUAGE plpgsql AS $$DECLARE v_start_date date:=p_start_date;v_end_date date;v_period int:=2;v_plan record;BEGIN SELECT 30 AS duration_days INTO v_plan;v_end_date := v_start_date + (v_plan.duration_days - 1);RETURN v_end_date;END$$;`)
  const sql = readFileSync('supabase/migrations/20261021063651_monthly_membership_validity.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const dates = [ ['2026-10-20',30,1,'2026-11-20'],['2026-01-31',30,1,'2026-02-28'],['2028-01-31',30,1,'2028-02-29'],['2026-01-31',30,2,'2026-03-31'],['2026-10-20',1,1,'2026-10-20'],['2026-10-20',7,1,'2026-10-26'] ]
  for (const [start,days,period,end] of dates) {
    const row = (await db.query('SELECT public.membership_cycle_end_date($1::date,$2,$3)::text AS result',[start,days,period])).rows[0]
    assert.equal(row.result,end)
  }
  for (const name of ['admin_assign_membership_plan','admin_approve_membership_renewal_request']) assert.equal((await db.query(`SELECT public.${name}('2026-10-20')::text AS result`)).rows[0].result,'2026-11-20')
  assert.equal((await db.query("SELECT admin_create_student_membership_cycles('2026-01-31')::text AS result")).rows[0].result,'2026-03-31')
  await assert.rejects(() => db.query("SELECT membership_cycle_end_date('2026-10-20',0)"))
  assert.equal((await db.query("SELECT has_function_privilege('anon','membership_cycle_end_date(date,integer,integer)','EXECUTE') AS allowed")).rows[0].allowed,false)
  console.log('11 monthly PostgreSQL assertions passed; all3 assignment paths patched; migration repeatable')
} finally { await db.close() }
