// Native PostgreSQL locks and fencing after the additive TE migration. Synthetic loopback only.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import pg from 'pg'
import { assertDisposableDatabase } from './runStudentProgressConcurrency.mjs'
const connectionString = assertDisposableDatabase(process.argv[2])
const observer = new pg.Client({ connectionString }),
  a = new pg.Client({ connectionString }),
  b = new pg.Client({ connectionString })
const student = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002',
  admin = '10000000-0000-4000-8000-000000000001'
const requestSQL =
  'SELECT admin_request_engine_link($1,$2,$3,$4,$5,$6,$7) AS value'
let checks = 0
const check = (actual, expected) => {
  assert.deepEqual(actual, expected)
  checks++
}
const args = (
  id,
  subject,
  external = 'cmp_alpha',
  link = null,
  action = 'confirm'
) => [
  action,
  id,
  subject,
  external,
  'Synthetic identity decision',
  link?.id ?? null,
  link?.revision ?? null,
]
async function begin(client, role = 'authenticated') {
  await client.query('BEGIN')
  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
    admin,
  ])
}
async function blocked() {
  for (let n = 0; n < 100; n++) {
    const row = (
      await observer.query(
        'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
        [b.processID]
      )
    ).rows[0]
    if (row?.wait_event_type === 'Lock') {
      checks++
      return
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  throw Error('Second connection did not block on the expected lock.')
}
async function race(
  firstSQL,
  firstArgs,
  secondSQL,
  secondArgs,
  expected = '40001',
  secondRole = 'authenticated'
) {
  await begin(a)
  await begin(b, secondRole)
  const winner = (await a.query(firstSQL, firstArgs)).rows[0].value
  const competing = b.query(secondSQL, secondArgs).then(
    (value) => ({ value }),
    (error) => ({ error })
  )
  await blocked()
  await a.query('COMMIT')
  const result = await competing
  check(result.error?.code, expected)
  await b.query('ROLLBACK')
  return winner
}
try {
  for (const client of [observer, a, b]) {
    await client.connect()
    await client.query("SET statement_timeout='10s'")
  }
  if (
    (await observer.query("SELECT to_regclass('public.students') AS name"))
      .rows[0].name
  )
    throw Error(
      'Refusing initialized test database; recreate only marked synthetic database first.'
    )
  await observer.query(
    readFileSync('tests/supabase/studentProgress.bootstrap.sql', 'utf8')
  )
  await observer.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;"
  )
  for (const file of [
    '20261020033416_student_progress_links.sql',
    '20261020151351_student_progress_competitions_links.sql',
  ])
    await observer.query(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  const first = await race(
    requestSQL,
    args('40000000-0000-4000-8000-000000000011', student),
    requestSQL,
    args('40000000-0000-4000-8000-000000000012', other),
    '23505'
  )
  check(first.link.status, 'pending')
  const replacement = await race(
    requestSQL,
    args(
      '40000000-0000-4000-8000-000000000013',
      student,
      'cmp_alpha',
      first.link
    ),
    requestSQL,
    args(
      '40000000-0000-4000-8000-000000000014',
      student,
      'cmp_alpha',
      first.link
    )
  )
  check(replacement.operation.generation, 2)
  await begin(observer)
  const claimed = (
    await observer.query(
      'SELECT admin_claim_engine_operation($1,$2) AS value',
      [student, replacement.operation.id]
    )
  ).rows[0].value
  await observer.query('COMMIT')
  const proof = {
    contract_version: 'te-academy-identity-v1',
    namespace: 'academy_reservas_student',
    competitor_id: 'cmp_alpha',
    external_id: student,
    generation: 2,
    link_status: 'confirmed',
    request: {
      request_id: claimed.operation.id,
      action: 'confirm',
      generation: 2,
      status: 'applied',
    },
  }
  const revoked = await race(
    requestSQL,
    args(
      '40000000-0000-4000-8000-000000000015',
      student,
      null,
      replacement.link,
      'revoke'
    ),
    'SELECT server_finalize_engine_operation($1,$2,$3,$4) AS value',
    [claimed.operation.id, claimed.lease.token, admin, proof],
    '40001',
    'service_role'
  )
  check(revoked.link.status, 'revoked')
  check(revoked.operation.generation, 3)
  check(
    (
      await observer.query(
        "SELECT count(*)::int n FROM student_progress_links WHERE source='tournament_engine' AND status='confirmed'"
      )
    ).rows[0].n,
    0
  )
  check(
    (
      await observer.query(
        'SELECT state FROM student_progress_link_operations WHERE id=$1',
        [claimed.operation.id]
      )
    ).rows[0].state,
    'superseded'
  )
  check(
    (
      await observer.query(
        'SELECT count(*)::int n FROM student_progress_link_audit'
      )
    ).rows[0].n,
    3
  )
  // Controls retain UUID RPC compatibility, one current membership identity, and exclusive external IDs.
  await begin(observer)
  const control = (
    await observer.query(
      'SELECT admin_confirm_progress_link($1,$2,$3,null,null) AS value',
      [
        student,
        '30000000-0000-4000-8000-000000000001',
        'Synthetic controls identity',
      ]
    )
  ).rows[0].value
  await observer.query('COMMIT')
  check(control.source, 'academy_controls')
  console.log(
    `Engine links PostgreSQL concurrency: 3 lock races and ${checks} assertions passed.`
  )
} catch (error) {
  console.error(error.code || error.message)
  process.exitCode = 1
} finally {
  for (const client of [observer, a, b]) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    try {
      await client.end()
    } catch {}
  }
}
