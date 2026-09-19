import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith('_multisite_memberships_core.sql'),
)
const migrationPath = migrationName ? join(migrationsDirectory, migrationName) : ''
const sql = migrationPath && existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

function functionSql(name: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  if (start < 0) return ''
  const end = sql.indexOf('\n$$;', start)
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4)
}

describe('multisite membership core migration', () => {
  it('creates and backfills academy locations with the approved Umacollo launch', () => {
    expect(migrationName).toMatch(/^\d{14}_multisite_memberships_core\.sql$/)
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.academy_locations')
    expect(sql).toMatch(/'tiabaya'[\s\S]*'Tiabaya'/i)
    expect(sql).toMatch(/'umacollo'[\s\S]*'Umacollo'[\s\S]*'2026-09-23'/i)
    expect(sql).toMatch(/ALTER TABLE public\.sessions[\s\S]*ADD COLUMN IF NOT EXISTS location_id uuid/i)
    expect(sql).toMatch(/ALTER TABLE public\.weekly_session_templates[\s\S]*ADD COLUMN IF NOT EXISTS location_id uuid/i)
    expect(sql).toMatch(/UPDATE public\.sessions[\s\S]*location_id[\s\S]*tiabaya/i)
  })

  it('models purchases, fixed schedules, recovery credits and freezes explicitly', () => {
    for (const table of ['membership_purchases', 'membership_fixed_schedules', 'membership_recovery_credits', 'membership_freezes', 'booking_cancellations']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }
    expect(sql).toMatch(/student_memberships[\s\S]*ADD COLUMN IF NOT EXISTS purchase_id uuid/i)
    expect(sql).toMatch(/student_memberships[\s\S]*ADD COLUMN IF NOT EXISTS cycle_number integer/i)
    expect(sql).toContain('recovery_classes')
    expect(sql).toContain('recovery_reason')
  })

  it('keeps booking cancellation sources and recurring exceptions auditable', () => {
    expect(sql).toMatch(/cancellation_source[\s\S]*student[\s\S]*academy[\s\S]*membership_freeze/i)
    expect(sql).toMatch(/review_status[\s\S]*pending[\s\S]*resolved[\s\S]*not_required/i)
    expect(sql).toContain('recurrence_assignment_id')
    expect(sql).toContain('manually_rescheduled')
    expect(sql).toContain('original_occurrence_date')
    expect(sql).toMatch(/UNIQUE[\s\S]*recurrence_assignment_id[\s\S]*original_occurrence_date/i)
  })

  it('creates atomic location-aware availability and booking APIs', () => {
    const availability = functionSql('get_multisite_session_availability')
    expect(availability).toContain('FOR UPDATE')
    expect(availability).toContain("v_location.code = 'umacollo'")
    expect(availability).toContain('physical_capacity')
    expect(availability).toContain('shared_bows_remaining')
    expect(availability).toContain('regular_spots_remaining')

    const booking = functionSql('book_session_multisite')
    expect(booking).toContain('FOR UPDATE')
    expect(booking).toContain('membership_freezes')
    expect(booking).toContain('weekly_class_target')
    expect(booking).toContain('recovery')
    expect(booking).toMatch(/ORDER BY[\s\S]*start_date ASC[\s\S]*created_at ASC[\s\S]*id ASC/i)
  })

  it('implements pending student cancellation without an immediate debit', () => {
    const cancellation = functionSql('cancel_booking')
    expect(cancellation).toContain("'student'")
    expect(cancellation).toContain("'pending'")
    expect(cancellation).toContain('booking_cancellations')
    expect(cancellation).not.toContain("'attendance_consumed'")

    const resolution = functionSql('admin_resolve_student_cancellation')
    expect(resolution).toContain("'justified'")
    expect(resolution).toContain("'no_show'")
    expect(resolution).toContain('FOR UPDATE')
    expect(resolution).toContain('weekly_extension_key')
    expect(resolution).toContain("interval '7 days'")
    expect(resolution).toContain("status = 'no_show'")
    expect(resolution).toContain('membership_fixed_schedules')
    expect(resolution).toContain('admin_generate_fixed_bookings')
  })

  it('freezes exact days and suppresses automatic weekly deficits for touched weeks', () => {
    const freeze = functionSql('admin_create_membership_freeze')
    expect(freeze).toContain('FOR UPDATE')
    expect(freeze).toContain('p_end_date - p_start_date + 1')
    expect(freeze).toContain("'membership_freeze'")
    expect(freeze).toContain('cycle_number')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_finish_membership_freeze')
    expect(functionSql('prevent_booking_with_frozen_membership')).toContain('v_session_date BETWEEN freeze.start_date AND freeze.end_date')

    const review = functionSql('get_weekly_attendance_review')
    expect(review).toContain('v_week_start := p_sunday - 6')
    expect(review).toContain('membership_freezes')
    expect(review).toContain('start_date > v_week_start')
    expect(review).toContain('end_date < p_sunday')
    expect(review).toContain('operational_status')
  })

  it('protects recovery balances, assigned bows and student privacy', () => {
    const booking = functionSql('book_session_multisite')
    expect(booking).toContain('candidate_credit.classes_remaining >')
    expect(booking).toContain('committed_booking.recovery_credit_id = candidate_credit.id')
    expect(functionSql('sync_student_membership_operational_status')).toContain('membership_recovery_credits')
    expect(functionSql('get_student_dashboard')).toContain('recovery.remaining')

    const availability = functionSql('get_multisite_session_availability')
    expect(availability).toContain('resolve_accessible_student_id')
    expect(availability).toContain('v_assigned_bow_available')
    const claims = functionSql('claim_booking_resources')
    expect(claims).toContain('FOR UPDATE SKIP LOCKED')
    expect(claims).toContain('El arco asignado no esta disponible en este horario')
    expect(sql).toMatch(/academy_bows_authenticated_read[\s\S]*USING \(public\.is_admin_user\(\)\)/)
  })

  it('creates Wednesday-Friday Umacollo templates and inactive Tuesday templates', () => {
    expect(sql).toContain("'Umacollo Miércoles 17:00'")
    expect(sql).toContain("'Umacollo Viernes 18:00'")
    expect(sql).toContain("'Umacollo Martes 17:00'")
    expect(sql).toMatch(/Umacollo Martes 17:00[\s\S]*false/i)
    expect(sql).toMatch(/17:00:00[\s\S]*18:00:00/i)
    expect(sql).toMatch(/18:00:00[\s\S]*19:00:00/i)
  })
})
