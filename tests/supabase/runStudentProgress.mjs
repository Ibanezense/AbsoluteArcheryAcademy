// Disposable PGlite only. Never run bootstrap files against the academy database.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(
  '../../output/postgres-test/node_modules/@electric-sql/pglite/dist/index.js'
)
const db = await PGlite.create()
let assertions = 0
const actor = async (id) => {
  await db.exec(`RESET ROLE;SET ROLE authenticated;SET request.jwt.claim.sub='${id}';`)
}
const s = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002',
  external = '30000000-0000-4000-8000-000000000001'
const admin = '10000000-0000-4000-8000-000000000001'
async function denied(sql) {
  await assert.rejects(() => db.query(sql))
  assertions++
}
const context = () => db.query(`select student_progress_context('${s}') as value`)
try {
  await db.exec(readFileSync('tests/supabase/studentProgress.bootstrap.sql', 'utf8'))
  await db.exec(
    readFileSync('supabase/migrations/20261020021006_student_progress_links.sql', 'utf8')
  )
  await actor(admin)
  const confirmed = (
    await db.query(
      `select admin_confirm_progress_link('${s}','${external}','verified source record',null,null) as value`
    )
  ).rows[0].value
  assert.equal(confirmed.status, 'confirmed')
  assertions++
  await denied(`select admin_confirm_progress_link('${s}','${external}','verified',null,null)`)
  await denied(`select admin_confirm_progress_link('${other}','${external}','verified',null,null)`)
  await denied(
    `select admin_confirm_progress_link('${other}','30000000-0000-4000-8000-000000000002','',null,null)`
  )
  for (const id of [
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
  ]) {
    await actor(id)
    assert.equal((await context()).rows[0].value.link.external_id, external)
    assertions++
    assert.equal((await db.query('select * from student_progress_links')).rows.length, 1)
    assertions++
    await denied(`select student_progress_context('${other}')`)
    await denied(`select admin_revoke_progress_link('${s}','${confirmed.id}',1)`)
    await denied(
      `update student_progress_links set external_id='30000000-0000-4000-8000-000000000003'`
    )
    assert.equal((await db.query('select * from student_progress_link_audit')).rows.length, 0)
    assertions++
  }
  await actor('10000000-0000-4000-8000-000000000004')
  await denied(`select student_progress_context('${s}')`)
  await actor('10000000-0000-4000-8000-000000000005')
  await denied(`select student_progress_context('${s}')`)
  await denied(`select admin_revoke_progress_link('${s}','${confirmed.id}',1)`)
  await db.exec("RESET ROLE;SET ROLE anon;SET request.jwt.claim.sub='';")
  await denied(`select student_progress_context('${s}')`)
  await actor(admin)
  await denied(`select admin_revoke_progress_link('${s}','${confirmed.id}',2)`)
  // Audit failure rolls back the mutation, including the revoked status/revision.
  await db.exec(
    "RESET ROLE;CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failed';END $$;CREATE TRIGGER test_fail BEFORE INSERT ON student_progress_link_audit FOR EACH ROW EXECUTE FUNCTION reject_audit();"
  )
  await actor(admin)
  await denied(`select admin_revoke_progress_link('${s}','${confirmed.id}',1)`)
  assert.equal((await context()).rows[0].value.link.revision, 1)
  assertions++
  await db.exec('RESET ROLE;DROP TRIGGER test_fail ON student_progress_link_audit;')
  await actor(admin)
  const revoked = (
    await db.query(`select admin_revoke_progress_link('${s}','${confirmed.id}',1) as value`)
  ).rows[0].value
  assert.equal(revoked.revision, 2)
  assertions++
  assert.equal((await context()).rows[0].value.link, null)
  assertions++
  assert.equal((await db.query('select * from student_progress_link_audit')).rows.length, 2)
  assertions++
  console.log(`Student progress SQL: ${assertions} assertions passed`)
} finally {
  await db.close()
}
