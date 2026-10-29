import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const connectionString = process.env.BIRTHDAY_TEST_DATABASE_URL
if (!connectionString) throw new Error('Set BIRTHDAY_TEST_DATABASE_URL to an isolated local birthday_* database.')
const address = new URL(connectionString)
if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) || !/^\/birthday_[a-z0-9_]+$/.test(address.pathname)) {
  throw new Error('Birthday concurrency tests require a local disposable birthday_* database; remote/other databases are forbidden.')
}
const adminUrl = new URL(connectionString); adminUrl.pathname = '/postgres'
const admin = new pg.Client({ connectionString: adminUrl.toString() })
await admin.connect()
const database = address.pathname.slice(1)
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`)
await admin.end()
const a = new pg.Client({ connectionString }), b = new pg.Client({ connectionString }), observer = new pg.Client({ connectionString })
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const load = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
try {
  await Promise.all([a.connect(), b.connect(), observer.connect()])
  await a.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC; DROP SCHEMA IF EXISTS auth CASCADE;')
  await a.query(load('tests/database/fixtures/birthdayNotifications.bootstrap.sql'))
  await a.query(load('supabase/migrations/20261021024214_academy_notifications.sql'))
  await a.query(load('supabase/migrations/20261029040555_student_birthday_notifications.sql'))
  await a.query("INSERT INTO profiles VALUES($1,'student',true),($2,'admin',true)", [id(1), id(2)])
  await a.query("INSERT INTO students VALUES($1,'Local fixture',((now() AT TIME ZONE 'America/Lima')::date-interval '15 years')::date,'active',$2,false)", [id(10), id(1)])
  const settings = await a.query("SELECT (now() AT TIME ZONE 'America/Lima')::date::text today, extract(year FROM now() AT TIME ZONE 'America/Lima')::integer celebration_year")
  const { today, celebration_year: year } = settings.rows[0]
  await a.query('BEGIN')
  await a.query('SELECT ensure_student_birthday_day()')
  // A concurrent generator must wait on the global lock, then see the completed result.
  const pending = b.query('SELECT ensure_student_birthday_day()')
  const waiting = await observer.query("SELECT pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE pid=$1", [b.processID])
  // Wait for the server to dispatch the query, not a guessed wall-clock duration.
  for (let n = 0; n < 100 && !waiting.rows[0]?.blockers?.length; n++) {
    const state = await observer.query('SELECT pg_blocking_pids($1) blockers', [b.processID])
    if (state.rows[0].blockers.length) break
    if (n === 99) throw new Error('Second generator did not enter lock wait')
  }
  await a.query('COMMIT'); await pending
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_days')).rows[0].n, 1)
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_day_students')).rows[0].n, 1)
  // A ready day is not regenerated even if deliberately tampered with in this disposable fixture.
  await a.query('DELETE FROM student_birthday_day_students')
  await b.query('SELECT ensure_student_birthday_day()')
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_day_students')).rows[0].n, 0)
  await a.query('UPDATE students SET date_of_birth=date_of_birth WHERE id=$1', [id(10)])

  await a.query("SELECT set_config('test.actor',$1,false)", [id(1)])
  await b.query("SELECT set_config('test.actor',$1,false)", [id(1)])
  async function waitBlocked(client) {
    for (let n = 0; n < 100; n++) {
      const state = await observer.query('SELECT pg_blocking_pids($1) blockers', [client.processID])
      if (state.rows[0].blockers.length) return
    }
    throw new Error('Expected concurrent operation to block before releasing the winning transaction')
  }
  const close = client => client.query('SELECT dismiss_student_birthday($1,$2,$3) value', [id(10), year, today])
  await a.query('BEGIN')
  assert.equal((await close(a)).rows[0].value.already_closed, false)
  const secondClose = close(b)
  await waitBlocked(b)
  await a.query('COMMIT')
  assert.equal((await secondClose).rows[0].value.already_closed, true)
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_dismissals')).rows[0].n, 1)

  // Edit wins the student lock: an old popup may not close a corrected future birthday.
  await a.query('DELETE FROM student_birthday_dismissals')
  await a.query('BEGIN')
  await a.query("UPDATE students SET date_of_birth=date_of_birth+1 WHERE id=$1", [id(10)])
  const staleClose = close(b).then(() => { throw new Error('Stale closure unexpectedly accepted') }, error => error)
  await waitBlocked(b)
  await a.query('COMMIT')
  assert.match((await staleClose).message, /BIRTHDAY_NOT_CURRENT/)
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_dismissals')).rows[0].n, 0)

  // Close wins the row lock: later DOB edits cannot erase its annual closure.
  await a.query('UPDATE students SET date_of_birth=date_of_birth-1 WHERE id=$1', [id(10)])
  await a.query('BEGIN'); await close(a)
  const correction = b.query('UPDATE students SET date_of_birth=date_of_birth+1 WHERE id=$1', [id(10)])
  await waitBlocked(b)
  await a.query('COMMIT'); await correction
  await a.query('UPDATE students SET date_of_birth=date_of_birth-1 WHERE id=$1', [id(10)])
  assert.equal((await a.query('SELECT get_student_notification_feed($1) value', [id(10)])).rows[0].value.birthday, null)
  await a.query("SELECT set_config('test.actor',$1,false)", [id(2)])
  assert.equal((await a.query('SELECT get_admin_student_birthday_flags($1) value', [[id(10)]])).rows[0].value.students[0].is_birthday_today, true)

  // A multi-student operational update must coexist with an unrelated profile edit.
  // Exclusive trigger locks caused row/global inversion here even for different students.
  await a.query("INSERT INTO students VALUES($1,'Second local fixture',((now() AT TIME ZONE 'America/Lima')::date-interval '15 years')::date,'active',NULL,false)", [id(20)])
  await a.query('BEGIN')
  await a.query('UPDATE students SET date_of_birth=date_of_birth WHERE id=$1', [id(10)])
  await b.query('BEGIN')
  await b.query("SET LOCAL statement_timeout='2s'")
  // This statement must finish while A still holds its projection lock.
  await b.query('UPDATE students SET date_of_birth=date_of_birth WHERE id=$1', [id(20)])
  const nextStudent = a.query('UPDATE students SET date_of_birth=date_of_birth WHERE id=$1', [id(20)])
  await waitBlocked(a)
  await b.query('COMMIT')
  await nextStudent
  await a.query('COMMIT')
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_day_students')).rows[0].n, 2)

  // Generation still excludes adjustments: an edit waiting behind the first scan
  // must apply its targeted correction once the completed day becomes visible.
  await a.query('DELETE FROM student_birthday_days')
  await a.query('BEGIN')
  await a.query('SELECT ensure_student_birthday_day()')
  const editAfterScan = b.query('UPDATE students SET date_of_birth=date_of_birth+1 WHERE id=$1', [id(10)])
  await waitBlocked(b)
  await a.query('COMMIT')
  await editAfterScan
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_day_students WHERE student_id=$1', [id(10)])).rows[0].n, 0)

  // Conversely, the scan waiting on an edit must see that edit's committed DOB.
  await a.query('DELETE FROM student_birthday_days')
  await a.query('BEGIN')
  await a.query('UPDATE students SET date_of_birth=date_of_birth-1 WHERE id=$1', [id(10)])
  const scanAfterEdit = b.query('SELECT ensure_student_birthday_day()')
  await waitBlocked(b)
  await a.query('COMMIT')
  await scanAfterEdit
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_day_students')).rows[0].n, 2)

  // Failed generation leaves no half-completed day. Recovery subsequently completes it.
  await a.query('DELETE FROM student_birthday_days')
  await a.query("CREATE FUNCTION test_generation_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture generation failure'; END$$; CREATE TRIGGER fixture_generation_failure BEFORE INSERT ON student_birthday_day_students FOR EACH ROW EXECUTE FUNCTION test_generation_failure()")
  await assert.rejects(a.query('SELECT ensure_student_birthday_day()'), /fixture generation failure/)
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_days')).rows[0].n, 0)
  await a.query('DROP TRIGGER fixture_generation_failure ON student_birthday_day_students; DROP FUNCTION test_generation_failure()')
  await a.query('SELECT ensure_student_birthday_day()')
  assert.equal((await a.query('SELECT count(*)::integer n FROM student_birthday_days WHERE completed_at IS NOT NULL')).rows[0].n, 1)
  await assert.rejects(a.query(load('supabase/operations/student_birthday_cron.sql')), /pg_cron must be installed/)
  console.log('PASS: real PostgreSQL concurrent generators, repeat-scan prevention, concurrent closures, edit/close races, multi-student/profile edits, scan/edit ordering, annual independence and failed-generation recovery.')
} finally {
  await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')])
  await Promise.allSettled([a.end(), b.end(), observer.end()])
}
