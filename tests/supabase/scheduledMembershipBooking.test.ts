import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260801_190000_multiple_active_student_memberships.sql'),
  'utf8',
)

function functionSql(functionName: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`
  const start = sql.indexOf(marker)
  if (start === -1) return ''

  const remaining = sql.slice(start + marker.length)
  const nextFunctionOffset = remaining.search(/\n\s*CREATE OR REPLACE FUNCTION public\./)
  return nextFunctionOffset === -1
    ? sql.slice(start)
    : sql.slice(start, start + marker.length + nextFunctionOffset)
}

describe('scheduled membership booking', () => {
  it('lists only sessions covered by a FIFO membership valid on the session date', () => {
    const availableSql = functionSql('get_available_sessions_for_student')

    expect(availableSql).toContain('public.select_student_membership_for_date')
    expect(availableSql).toMatch(/\(s\.start_at AT TIME ZONE 'America\/Lima'\)::date/i)
    expect(availableSql).toMatch(/JOIN LATERAL[\s\S]*select_student_membership_for_date/i)
  })

  it('allows scheduled students while preserving protected operational blocks', () => {
    for (const functionName of ['book_session', 'admin_book_session']) {
      const bookingSql = functionSql(functionName)

      expect(bookingSql).toContain("IN ('retired', 'withdrawn', 'blocked', 'suspended')")
      expect(bookingSql).not.toMatch(/operational_status[\s\S]{0,100}<>\s*'active'/i)
      expect(bookingSql).toContain('public.select_student_membership_for_date')
    }
  })

  it('returns cards for the oldest current or future usable membership', () => {
    const cardsSql = functionSql('get_student_class_cards')

    expect(cardsSql).toContain("IN ('retired', 'withdrawn', 'blocked', 'suspended')")
    expect(cardsSql).toMatch(/sm\.end_date\s*>=\s*v_today/i)
    expect(cardsSql).toMatch(/ORDER BY[\s\S]*sm\.start_date ASC[\s\S]*sm\.created_at ASC/i)
  })

  it('declares the sync accumulator only once', () => {
    const syncSql = functionSql('sync_student_membership_operational_status')
    expect(syncSql.match(/v_total_changed integer := 0;/g)).toHaveLength(1)
  })

  it('keeps service and billing dates independent in cycle creation', () => {
    const createSql = functionSql('admin_create_student_membership_cycles')

    expect(createSql).toMatch(/classes_remaining,[\s\S]*start_date,[\s\S]*billing_date,[\s\S]*VALUES[\s\S]*v_classes,[\s\S]*0,[\s\S]*v_classes,[\s\S]*v_start_date,[\s\S]*COALESCE\(p_billing_date, v_start_date\)/i)
    expect(createSql).toMatch(/student_membership_payments[\s\S]*due_date,[\s\S]*VALUES[\s\S]*v_membership_id,[\s\S]*COALESCE\(p_billing_date, v_start_date\)/i)
  })
})
