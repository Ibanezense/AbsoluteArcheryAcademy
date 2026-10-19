import { readFileSync } from 'node:fs';
// Isolated optional runtime: npm install --prefix output/postgres-test --no-save @electric-sql/pglite@0.5.10
const { PGlite } = await import(new URL('../../output/postgres-test/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href);
const db = await PGlite.create();
try {
await db.exec(readFileSync('tests/supabase/studentBookingAgenda.bootstrap.sql','utf8'));
const core = readFileSync('supabase/migrations/20260915013310_multisite_memberships_core.sql','utf8');
const capacity = core.slice(core.indexOf('CREATE OR REPLACE FUNCTION public.get_multisite_session_availability('), core.indexOf('CREATE OR REPLACE FUNCTION public.claim_booking_resources('));
await db.exec(capacity);
const statusSource=readFileSync('supabase/migrations/20260829012228_admin_manual_student_inactive.sql','utf8');
await db.exec(statusSource.slice(statusSource.indexOf('CREATE OR REPLACE FUNCTION public.is_student_protected_operational_status('),statusSource.indexOf('CREATE OR REPLACE FUNCTION public.admin_set_student_inactive(')));
await db.exec(readFileSync('supabase/migrations/20261019201815_student_booking_agenda_and_detail.sql','utf8'));
await db.exec(readFileSync('tests/supabase/studentBookingAgenda.integration.sql','utf8'));
console.log('Student booking agenda PostgreSQL boundaries and roles passed');
} catch(e) { console.error(e.message); process.exitCode=1; } finally { await db.close(); }
