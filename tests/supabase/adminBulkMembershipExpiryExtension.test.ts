import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260821234317_bulk_membership_expiry_extension.sql',
  ),
  'utf8',
)

function functionSql(functionName: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`
  const start = sql.indexOf(marker)
  if (start === -1) return ''

  const remaining = sql.slice(start + marker.length)
  const nextStatementOffset = remaining.search(
    /\n\s*(?:CREATE OR REPLACE FUNCTION|REVOKE|GRANT)\b/i,
  )

  return nextStatementOffset === -1
    ? sql.slice(start)
    : sql.slice(start, start + marker.length + nextStatementOffset)
}

describe('bulk membership expiry extension migration', () => {
  const previewSql = functionSql('admin_preview_bulk_membership_expiry_extension')
  const applySql = functionSql('admin_apply_bulk_membership_expiry_extension')

  it('defines the approved preview and idempotent apply RPC signatures', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_preview_bulk_membership_expiry_extension\(\s*\)/i,
    )
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_apply_bulk_membership_expiry_extension\(\s*p_reason\s+text\s*,\s*p_idempotency_key\s+uuid\s*\)/i,
    )
  })

  it('uses the Lima calendar date and extends end_date by exactly seven days', () => {
    for (const rpcSql of [previewSql, applySql]) {
      expect(rpcSql).toMatch(/now\(\)\s+AT TIME ZONE\s+'America\/Lima'/i)
      expect(rpcSql).toMatch(/end_date\s*\+\s*7\b/i)
    }

    expect(applySql).toMatch(
      /UPDATE\s+public\.student_memberships[\s\S]*?SET[\s\S]*?end_date\s*=\s*[^,;]*end_date\s*\+\s*7\b/i,
    )
  })

  it('selects one latest eligible unexpired membership per student', () => {
    for (const rpcSql of [previewSql, applySql]) {
      expect(rpcSql).toMatch(/DISTINCT\s+ON\s*\(\s*(?:sm\.)?student_id\s*\)/i)
      expect(rpcSql).toMatch(/status\s*=\s*'active'/i)
      expect(rpcSql).toMatch(/classes_remaining\s*>\s*0/i)
      expect(rpcSql).toMatch(/end_date\s+IS\s+NOT\s+NULL/i)
      expect(rpcSql).toMatch(/end_date\s*>=\s*v_today(?:_lima)?\b/i)
      expect(rpcSql).toMatch(
        /ORDER BY\s+(?:sm\.)?student_id\s*,\s*(?:sm\.)?start_date\s+DESC\s*,\s*(?:sm\.)?created_at\s+DESC\s*,\s*(?:sm\.)?id\s+DESC/i,
      )
    }
  })

  it('persists a UUID-keyed idempotency batch with a required reason and audit trail', () => {
    expect(sql).toMatch(
      /CREATE TABLE(?: IF NOT EXISTS)? public\.membership_expiry_extension_batches\s*\([\s\S]*?(?:id|idempotency_key)\s+uuid\s+(?:NOT NULL\s+)?PRIMARY KEY/i,
    )
    expect(applySql).toMatch(/p_idempotency_key/i)
    expect(applySql).toMatch(/ON CONFLICT\s*\([^)]+\)/i)
    expect(applySql).toMatch(/already_applied/i)
    expect(applySql).toMatch(/(?:btrim|trim)\s*\(\s*p_reason\s*\)/i)
    expect(applySql).toMatch(/RAISE EXCEPTION[\s\S]*?(?:motivo|reason)/i)
    expect(sql).toMatch(/reason\s+text\s+NOT NULL/i)
    expect(applySql).toMatch(/public\.log_admin_action\s*\(/i)
  })

  it('keeps both SECURITY DEFINER RPCs admin-only with a fixed search path', () => {
    for (const rpcSql of [previewSql, applySql]) {
      expect(rpcSql).toMatch(/SECURITY DEFINER/i)
      expect(rpcSql).toMatch(/SET search_path\s*(?:=|TO)\s*public/i)
      expect(rpcSql).toMatch(/(?:auth\.uid\(\)|v_actor_id)\s+IS\s+NULL/i)
      expect(rpcSql).toMatch(/public\.is_admin_user\(\)/i)
    }

    for (const signature of [
      'admin_preview_bulk_membership_expiry_extension()',
      'admin_apply_bulk_membership_expiry_extension(text, uuid)',
    ]) {
      const escapedSignature = signature.replace(/[().]/g, '\\$&')
      expect(sql).toMatch(
        new RegExp(
          `REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${escapedSignature} FROM PUBLIC;`,
          'i',
        ),
      )
      expect(sql).toMatch(
        new RegExp(
          `REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${escapedSignature} FROM anon;`,
          'i',
        ),
      )
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escapedSignature} TO authenticated;`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escapedSignature} TO service_role;`, 'i'),
      )
    }
  })

  it('updates only membership expiry metadata, never classes or financial fields', () => {
    expect(applySql).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:bookings|student_membership_payments|student_credit_ledger|membership_plans|students)\b/i,
    )

    const membershipUpdate = applySql.match(
      /UPDATE\s+public\.student_memberships\b[\s\S]*?SET([\s\S]*?)WHERE\b/i,
    )?.[1] ?? ''

    expect(membershipUpdate).not.toMatch(
      /\b(?:classes_total|classes_used|classes_remaining|amount|amount_paid|price|origin|source|start_date)\s*=/i,
    )
    expect(membershipUpdate).toMatch(/\bend_date\s*=/i)
  })
})
