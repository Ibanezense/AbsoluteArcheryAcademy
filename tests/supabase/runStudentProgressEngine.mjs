// Isolated PGlite only: engine links/leases/finalizer permissions and controls compatibility.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
let db
if (process.argv[2]) {
  const { assertDisposableDatabase } = await import(
    './runStudentProgressConcurrency.mjs'
  )
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    connectionString: assertDisposableDatabase(process.argv[2]),
  })
  await client.connect()
  if (
    (await client.query("SELECT to_regclass('public.students') AS name"))
      .rows[0].name
  ) {
    await client.end()
    throw Error(
      'Refusing initialized test database: use guarded preparation runner first.'
    )
  }
  db = {
    query: (...args) => client.query(...args),
    exec: (sql) => client.query(sql),
    close: () => client.end(),
  }
} else {
  const { PGlite } = await import(
    '../../output/postgres-test/node_modules/@electric-sql/pglite/dist/index.js'
  )
  db = await PGlite.create()
}
const admin = '10000000-0000-4000-8000-000000000001',
  student = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002'
let count = 0
const check = (a, b) => {
  assert.deepEqual(a, b)
  count++
}
const role = async (name = 'authenticated', id = admin) =>
  db.exec(`RESET ROLE;SET ROLE ${name};SET request.jwt.claim.sub='${id}';`)
const val = async (sql, args = []) => (await db.query(sql, args)).rows[0].value
const denied = async (sql, args = []) => {
  await assert.rejects(() => db.query(sql, args))
  count++
}
const request = (
  action,
  id,
  external = 'cmp_alpha',
  link = null,
  subject = student
) =>
  val('SELECT admin_request_engine_link($1,$2,$3,$4,$5,$6,$7) AS value', [
    action,
    id,
    subject,
    external,
    action === 'confirm' ? 'Identity checked' : 'Revocación administrativa',
    link?.id ?? null,
    link?.revision ?? null,
  ])
const claim = (id) =>
  val('SELECT admin_claim_engine_operation($1,$2) AS value', [student, id])
const context = () =>
  val('SELECT engine_progress_context($1) AS value', [student])
function proof(operation, status = 'confirmed') {
  return {
    contract_version: 'te-academy-identity-v1',
    namespace: 'academy_reservas_student',
    competitor_id: operation.external_id,
    external_id: operation.student_id,
    generation: operation.generation,
    link_status: status,
    request: {
      request_id: operation.id,
      action: operation.action,
      generation: operation.generation,
      status: 'applied',
    },
  }
}
const finalize = (c, p = proof(c.operation)) =>
  val('SELECT server_finalize_engine_operation($1,$2,$3,$4) AS value', [
    c.operation.id,
    c.lease.token,
    admin,
    p,
  ])
try {
  await db.exec(
    readFileSync('tests/supabase/studentProgress.bootstrap.sql', 'utf8')
  )
  await db.exec(
    "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;"
  )
  await db.exec(
    readFileSync(
      'supabase/migrations/20261020033416_student_progress_links.sql',
      'utf8'
    )
  )
  await db.exec(
    readFileSync(
      'supabase/migrations/20261020151351_student_progress_competitions_links.sql',
      'utf8'
    )
  )
  await role()
  const first = await request('confirm', '40000000-0000-4000-8000-000000000001')
  check(first.link.status, 'pending')
  check((await context()).links.length, 0)
  check(
    (await request('confirm', first.operation.id)).operation.id,
    first.operation.id
  )
  await assert.rejects(() => request('confirm', first.operation.id, 'other_id'))
  count++
  const c = await claim(first.operation.id)
  check(!!c.lease.token, true)
  check(
    await val('SELECT admin_verify_engine_operation($1,$2,$3) AS value', [
      student,
      c.operation.id,
      c.lease.token,
    ]),
    true
  )
  check((await claim(first.operation.id)).lease, null)
  await denied('SELECT server_finalize_engine_operation($1,$2,$3,$4)', [
    c.operation.id,
    c.lease.token,
    admin,
    proof(c.operation),
  ])
  await denied(
    "UPDATE student_progress_links SET status='confirmed' WHERE id=$1",
    [first.link.id]
  )
  await role('service_role')
  await assert.rejects(() =>
    finalize(c, { ...proof(c.operation), external_id: other })
  )
  count++
  await db.exec('RESET ROLE')
  await db.query('UPDATE profiles SET is_active=false WHERE id=$1', [admin])
  await role('service_role')
  await assert.rejects(() => finalize(c))
  count++
  await db.exec('RESET ROLE')
  await db.query('UPDATE profiles SET is_active=true WHERE id=$1', [admin])
  await role('service_role')
  const confirmed = await finalize(c)
  check(confirmed.link.status, 'confirmed')
  check(confirmed.operation.state, 'completed')
  await role()
  check((await context()).links.length, 1)
  const second = await request(
    'confirm',
    '40000000-0000-4000-8000-000000000002',
    'cmp_beta'
  )
  check(second.link.status, 'pending')
  const c2 = await claim(second.operation.id)
  await role('service_role')
  await finalize(c2)
  await role()
  check((await context()).links.length, 2)
  await assert.rejects(() =>
    request(
      'confirm',
      '40000000-0000-4000-8000-000000000003',
      'cmp_alpha',
      null,
      other
    )
  )
  count++
  const revoke = await request(
    'revoke',
    '40000000-0000-4000-8000-000000000004',
    null,
    confirmed.link
  )
  check(revoke.link.status, 'revoked')
  check(revoke.operation.generation, 2)
  check((await context()).links.length, 1)
  const rc = await claim(revoke.operation.id)
  await role('service_role')
  await finalize(rc, proof(rc.operation, 'revoked'))
  await role()
  // A new confirm preserves the same row and advances generation; revocation supersedes an in-flight confirm.
  const again = await request(
    'confirm',
    '40000000-0000-4000-8000-000000000005',
    'cmp_alpha',
    revoke.link
  )
  check(again.link.id, first.link.id)
  check(again.operation.generation, 3)
  const late = await claim(again.operation.id)
  const stop = await request(
    'revoke',
    '40000000-0000-4000-8000-000000000006',
    null,
    again.link
  )
  check(stop.operation.generation, 4)
  check((await claim(again.operation.id)).operation.state, 'superseded')
  await role('service_role')
  await assert.rejects(() => finalize(late))
  count++
  await role()
  check(
    (await context()).links.some((l) => l.id === first.link.id),
    false
  )
  // Legacy controls UUID RPC keeps its signature and works after external_id became text.
  const control = await val(
    'SELECT admin_confirm_progress_link($1,$2,$3,null,null) AS value',
    [student, '30000000-0000-4000-8000-000000000001', 'Original controls']
  )
  check(control.source, 'academy_controls')
  check(
    (await val('SELECT student_progress_context($1) AS value', [student])).link
      .id,
    control.id
  )
  for (const actor of [
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
  ]) {
    await role('authenticated', actor)
    check((await context()).links.length, 1)
    await denied('SELECT admin_claim_engine_operation($1,$2)', [
      student,
      stop.operation.id,
    ])
    await denied('SELECT server_finalize_engine_operation($1,$2,$3,$4)', [
      c.operation.id,
      c.lease.token,
      admin,
      proof(c.operation),
    ])
  }
  await role('authenticated', '10000000-0000-4000-8000-000000000004')
  await denied('SELECT engine_progress_context($1)', [student])
  await role('anon', '')
  await denied('SELECT engine_progress_context($1)', [student])
  console.log(`Engine links SQL: ${count} assertions passed`)
} catch (error) {
  console.error(error.code || error.message)
  process.exitCode = 1
} finally {
  await db.close()
}
