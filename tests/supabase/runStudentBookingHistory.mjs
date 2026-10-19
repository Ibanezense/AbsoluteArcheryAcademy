import { readFileSync } from 'node:fs';
// Isolated optional runtime: npm install --prefix output/postgres-test --no-save @electric-sql/pglite@0.5.10
const { PGlite } = await import(new URL('../../output/postgres-test/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href);
const db = await PGlite.create();
try {
  await db.exec(readFileSync('tests/supabase/studentBookingHistory.bootstrap.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261019201808_student_filtered_booking_history.sql', 'utf8'));
  await db.exec(readFileSync('tests/supabase/studentBookingHistory.integration.sql', 'utf8'));
  console.log('Student history PostgreSQL boundaries and roles passed');
} finally {
  await db.close();
}
