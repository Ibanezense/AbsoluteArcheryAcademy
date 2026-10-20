// Real PostgreSQL concurrency checks. Only the disposable marked loopback database is accepted.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import pg from 'pg'

export function assertDisposableDatabase(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    throw new Error('A disposable test database URL is required.')
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.port !== '55439' ||
    url.pathname !== '/codex_student_progress_test' ||
    url.username !== 'codex_progress_test' ||
    url.password !== 'codex-local-test-only' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Refusing database: requires the marked disposable local progress test database on port 55439.'
    )
  }
  return input
}

async function run(input) {
  const connectionString = assertDisposableDatabase(input)
  const observer = new pg.Client({
    connectionString,
    application_name: 'codex-progress-test-observer',
  })
  const first = new pg.Client({ connectionString, application_name: 'codex-progress-test-first' })
  const second = new pg.Client({ connectionString, application_name: 'codex-progress-test-second' })
  const clients = [observer, first, second]
  const admin = '10000000-0000-4000-8000-000000000001'
  const student = '20000000-0000-4000-8000-000000000001'
  const other = '20000000-0000-4000-8000-000000000002'
  const external = (suffix) => `30000000-0000-4000-8000-${suffix.padStart(12, '0')}`
  const confirmSql = 'SELECT public.admin_confirm_progress_link($1,$2,$3,$4,$5) AS value'
  const confirmArgs = (subject, externalId, expected = null) => [
    subject,
    externalId,
    'Disposable identity evidence',
    expected?.id ?? null,
    expected?.revision ?? null,
  ]
  let races = 0
  let assertions = 0
  const check = (actual, expected) => {
    assert.equal(actual, expected)
    assertions++
  }
  async function begin(client) {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE authenticated')
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin])
  }
  async function observeBlocked() {
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      const row = (
        await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [
          second.processID,
        ])
      ).rows[0]
      if (row?.wait_event_type === 'Lock') {
        assertions++
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    throw new Error('Expected competing transaction to wait for a PostgreSQL lock.')
  }
  async function race(firstArgs, secondSql, secondArgs, conflictCode) {
    await begin(first)
    await begin(second)
    const winner = (await first.query(confirmSql, firstArgs)).rows[0].value
    // Install rejection handler immediately so an early conflict cannot become unhandled.
    const competing = second.query(secondSql, secondArgs).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error })
    )
    await observeBlocked()
    await first.query('COMMIT')
    const loser = await competing
    check(loser.ok, false)
    check(loser.error?.code, conflictCode)
    await second.query('ROLLBACK')
    races++
    return winner
  }
  try {
    for (const client of clients) {
      await client.connect()
      await client.query("SET statement_timeout='10s'")
    }
    const existing = (await observer.query("SELECT to_regclass('public.students') AS table_name"))
      .rows[0].table_name
    if (existing)
      throw new Error(
        'Refusing to reuse an initialized database; recreate only the marked test database with the preparation runner.'
      )
    await observer.query(readFileSync('tests/supabase/studentProgress.bootstrap.sql', 'utf8'))
    await observer.query(
      readFileSync('supabase/migrations/20261020033416_student_progress_links.sql', 'utf8')
    )

    // Different students competing for the same external identity: one succeeds.
    let current = await race(
      confirmArgs(student, external('1')),
      confirmSql,
      confirmArgs(other, external('1')),
      '23505'
    )
    check(
      (
        await observer.query(
          "SELECT count(*)::int AS n FROM public.student_progress_links WHERE status='confirmed' AND external_id=$1",
          [external('1')]
        )
      ).rows[0].n,
      1
    )
    check(
      (await observer.query('SELECT count(*)::int AS n FROM public.student_progress_link_audit'))
        .rows[0].n,
      1
    )

    // Same student and same expected revision: stale replacement cannot win later.
    current = await race(
      confirmArgs(student, external('2'), current),
      confirmSql,
      confirmArgs(student, external('3'), current),
      '40001'
    )
    check(current.external_id, external('2'))
    check(
      (
        await observer.query(
          "SELECT count(*)::int AS n FROM public.student_progress_links WHERE status='confirmed' AND student_id=$1",
          [student]
        )
      ).rows[0].n,
      1
    )
    check(
      (await observer.query('SELECT count(*)::int AS n FROM public.student_progress_link_audit'))
        .rows[0].n,
      3
    )

    // Replacement racing revocation of that same prior revision: revoke must conflict.
    const previous = current
    current = await race(
      confirmArgs(student, external('4'), previous),
      'SELECT public.admin_revoke_progress_link($1,$2,$3) AS value',
      [student, previous.id, previous.revision],
      '40001'
    )
    check(current.external_id, external('4'))
    check(
      (await observer.query('SELECT count(*)::int AS n FROM public.student_progress_link_audit'))
        .rows[0].n,
      5
    )
    check(
      (
        await observer.query(
          "SELECT count(*)::int AS n FROM public.student_progress_links WHERE status='confirmed'"
        )
      ).rows[0].n,
      1
    )
    check(
      (
        await observer.query(
          "SELECT revision FROM public.student_progress_links WHERE id=$1 AND status='revoked'",
          [previous.id]
        )
      ).rows[0].revision,
      2
    )
    check(
      (
        await observer.query(
          'SELECT count(*)::int AS n FROM public.student_progress_link_audit WHERE actor_id<>$1',
          [admin]
        )
      ).rows[0].n,
      0
    )
    // Every committed link transition has an audit record with the actual row identity.
    check(
      (
        await observer.query(
          "SELECT count(*)::int AS n FROM public.student_progress_link_audit WHERE after_data->>'id' <> link_id::text"
        )
      ).rows[0].n,
      0
    )
    console.log(
      `Student progress PostgreSQL concurrency: ${races} lock races and ${assertions} assertions passed.`
    )
  } finally {
    for (const client of clients) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* connection may not have opened */
      }
      try {
        await client.end()
      } catch {
        /* preserve original test failure */
      }
    }
  }
}

if (
  process.argv[1] &&
  new URL(import.meta.url).pathname
    .replace(/^\//, '')
    .toLowerCase()
    .endsWith(process.argv[1].replace(/\\/g, '/').replace(/^\//, '').toLowerCase())
) {
  run(process.argv[2]).catch((error) => {
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : `Concurrency verification failed: ${error.code || error.message}`
    )
    process.exitCode = 1
  })
}
