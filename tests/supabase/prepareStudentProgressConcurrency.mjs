// Recreate only the marked synthetic database on this workspace's disposable cluster.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'
if (process.argv[2] !== '--reset-test-database')
  throw Error('Pass --reset-test-database to reset the synthetic progress test database.')
const cluster = resolve(
  fileURLToPath(new URL('../../output/postgres-native/cluster', import.meta.url))
)
let client
for (let attempt = 0; attempt < 20; attempt++) {
  client = new pg.Client({
    connectionString:
      'postgres://codex_progress_test:codex-local-test-only@127.0.0.1:55439/postgres',
    connectionTimeoutMillis: 2000,
  })
  try {
    await client.connect()
    break
  } catch (error) {
    await client.end()
    if (!['57P03', 'ECONNREFUSED', 'ECONNRESET'].includes(error.code) || attempt === 19) throw error
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
try {
  await client.query("SET statement_timeout='5s'")
  const directory = (await client.query('SHOW data_directory')).rows[0].data_directory
  if (resolve(directory).toLowerCase() !== cluster.toLowerCase())
    throw Error('Refusing reset: this is not the workspace disposable cluster.')
  const actor = (await client.query('SELECT current_user AS name')).rows[0].name
  if (actor !== 'codex_progress_test') throw Error('Refusing reset: unexpected database actor.')
  await client.query('DROP DATABASE IF EXISTS codex_student_progress_test WITH (FORCE)')
  await client.query('CREATE DATABASE codex_student_progress_test')
  console.log(
    'Recreated only codex_student_progress_test on the workspace disposable cluster (127.0.0.1:55439).'
  )
} finally {
  await client.end()
}
