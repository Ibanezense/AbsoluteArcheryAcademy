import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('manual intro booking availability', () => {
  it('allows manual Umacollo sessions without a weekly template', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260921200000_manual_intro_booking_availability.sql'),
      'utf8',
    )

    expect(sql).toContain('LEFT JOIN public.weekly_session_templates template')
    expect(sql).toContain('template.id IS NULL')
    expect(sql).toContain("location.code = 'umacollo'")
    expect(sql).toContain('template.allows_intro = true')
    expect(sql).toContain("availability.data->>'physical_spots_remaining'")
    expect(sql).not.toContain("availability.data->>'intro_spots_remaining'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.session_accepts_intro')
    expect(sql).toContain("OR (template.id IS NULL AND location.code = 'umacollo')")
  })
})
