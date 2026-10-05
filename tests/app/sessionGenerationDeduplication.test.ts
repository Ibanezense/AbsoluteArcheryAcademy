import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/20261005224905_session_generation_and_profile_booking.sql', 'utf8')
describe('session generation safeguards', () => {
  it('supports an inclusive ending date and identifies turns by location and time', () => {
    expect(sql.includes('admin_generate_sessions_in_range')).toBe(true)
    expect(sql.includes('s.location_id = v_template.location_id')).toBe(true)
    expect(sql.includes('v_date <= p_date_to')).toBe(true)
    expect(sql.includes('ON CONFLICT DO NOTHING')).toBe(true)
  })
  it('never deletes a session with bookings and archives the removed session', () => {
    expect(sql.includes('NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.session_id = s.id)')).toBe(true)
    expect(sql.includes('session_duplicate_removed')).toBe(true)
    expect(sql.includes("'session', to_jsonb(s)")).toBe(true)
  })
  it('checks admin permissions and preserves the existing weekly signature', () => {
    expect(sql.includes('NOT public.is_admin_user()')).toBe(true)
    expect(sql.includes('admin_generate_sessions_from_templates(')).toBe(true)
    expect(sql.includes('FROM PUBLIC, anon')).toBe(true)
  })
})
