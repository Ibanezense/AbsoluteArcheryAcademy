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

const executableSql = sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '')

function functionSql(functionName: string) {
  const declaration = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${functionName}\\b`,
    'i',
  ).exec(executableSql)
  if (!declaration) return ''

  const start = declaration.index
  const remaining = executableSql.slice(start + declaration[0].length)
  const nextStatementOffset = remaining.search(
    /\n\s*(?:CREATE\s+OR\s+REPLACE\s+FUNCTION|REVOKE|GRANT)\b/i,
  )

  return nextStatementOffset === -1
    ? executableSql.slice(start)
    : executableSql.slice(start, start + declaration[0].length + nextStatementOffset)
}

describe('bulk membership expiry extension migration', () => {
  const previewSql = functionSql('admin_preview_bulk_membership_expiry_extension')
  const applySql = functionSql('admin_apply_bulk_membership_expiry_extension')

  it('defines the approved preview and idempotent apply RPC signatures', () => {
    expect(executableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_preview_bulk_membership_expiry_extension\(\s*\)/i,
    )
    expect(executableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_apply_bulk_membership_expiry_extension\(\s*p_reason\s+text\s*,\s*p_idempotency_key\s+uuid\s*\)/i,
    )
  })

  it('uses the Lima calendar date and extends end_date by exactly seven days', () => {
    for (const rpcSql of [previewSql, applySql]) {
      expect(rpcSql).toMatch(/now\(\)\s+AT TIME ZONE\s+'America\/Lima'/i)
      expect(rpcSql).toMatch(
        /end_date\s*\+\s*(?:7|INTERVAL\s+'7 days')\s*(?=AS\s+new_end_date|,|\bWHERE\b)/i,
      )
    }

    expect(applySql).toMatch(
      /UPDATE\s+public\.student_memberships[\s\S]*?SET[\s\S]*?end_date\s*=\s*(?:\w+\.)?end_date\s*\+\s*(?:7|INTERVAL\s+'7 days')\s*(?=,|\bWHERE\b)/i,
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

  it('locks the selected candidate IDs and updates exclusively those memberships', () => {
    expect(applySql).toMatch(
      /SELECT\s+array_agg\s*\(\s*(?:candidate\.)?id[^)]*\)[\s\S]*?INTO\s+v_target_ids[\s\S]*?DISTINCT\s+ON\s*\(\s*(?:sm\.)?student_id\s*\)/i,
    )
    expect(applySql).toMatch(
      /(?:SELECT|PERFORM)[\s\S]*?FROM\s+public\.student_memberships[\s\S]*?WHERE\s+(?:\w+\.)?id\s*=\s*ANY\s*\(\s*v_target_ids\s*\)\s*(?:ORDER BY\s+(?:\w+\.)?id\s*)?FOR\s+UPDATE/i,
    )

    const updateWhere = applySql.match(
      /UPDATE\s+public\.student_memberships[\s\S]*?\bWHERE\s+([\s\S]*?)(?:\bRETURNING\b|;)/i,
    )?.[1]
      .replace(/\s+/g, ' ')
      .trim() ?? ''

    expect(updateWhere).toMatch(
      /^(?:\w+\.)?id\s*=\s*ANY\s*\(\s*v_target_ids\s*\)$/i,
    )
  })

  it('persists the complete UUID-keyed idempotency batch contract', () => {
    const batchTableSql = executableSql.match(
      /CREATE TABLE(?: IF NOT EXISTS)? public\.membership_expiry_extension_batches\s*\(([\s\S]*?)\);/i,
    )?.[1] ?? ''

    expect(batchTableSql).toMatch(
      /idempotency_key\s+uuid\s+(?:NOT NULL\s+)?PRIMARY KEY/i,
    )
    expect(batchTableSql).toMatch(/actor_profile_id\s+uuid\b/i)
    expect(batchTableSql).toMatch(/reason\s+text\s+NOT NULL/i)
    expect(batchTableSql).toMatch(
      /extension_days\s+integer\s+NOT NULL\s+DEFAULT\s+7/i,
    )
    expect(batchTableSql).toMatch(/CHECK\s*\(\s*extension_days\s*=\s*7\s*\)/i)
    expect(batchTableSql).toMatch(/affected_count\s+integer\b/i)
    expect(batchTableSql).toMatch(/result\s+jsonb\b/i)
    expect(batchTableSql).toMatch(/created_at\s+timestamptz\b/i)
  })

  it('returns a stored batch result on retries before touching memberships', () => {
    const membershipUpdateOffset = applySql.search(
      /UPDATE\s+public\.student_memberships\b/i,
    )
    const beforeMembershipUpdate =
      membershipUpdateOffset === -1 ? applySql : applySql.slice(0, membershipUpdateOffset)

    expect(beforeMembershipUpdate).toMatch(
      /INSERT\s+INTO\s+public\.membership_expiry_extension_batches\s*\([\s\S]*?idempotency_key[\s\S]*?VALUES\s*\([\s\S]*?p_idempotency_key/i,
    )
    expect(beforeMembershipUpdate).toMatch(
      /ON CONFLICT\s*\(\s*idempotency_key\s*\)\s+DO NOTHING/i,
    )
    expect(beforeMembershipUpdate).toMatch(
      /IF\s+NOT\s+FOUND\s+THEN[\s\S]*?SELECT\s+(?:\w+\.)?result[\s\S]*?WHERE\s+(?:\w+\.)?idempotency_key\s*=\s*p_idempotency_key[\s\S]*?RETURN[\s\S]*?already_applied[\s\S]*?true[\s\S]*?END IF;/i,
    )
  })

  it('persists the real affected count and result after updating memberships', () => {
    const membershipUpdateOffset = applySql.search(
      /UPDATE\s+public\.student_memberships\b/i,
    )
    const batchResultUpdateOffset = applySql.search(
      /UPDATE\s+public\.membership_expiry_extension_batches\b/i,
    )

    expect(membershipUpdateOffset).toBeGreaterThanOrEqual(0)
    expect(batchResultUpdateOffset).toBeGreaterThan(membershipUpdateOffset)

    const afterMembershipUpdate = applySql.slice(membershipUpdateOffset)
    expect(afterMembershipUpdate).toMatch(
      /GET DIAGNOSTICS\s+v_affected_count\s*=\s*ROW_COUNT\s*;/i,
    )
    const persistedBatchResult = afterMembershipUpdate.match(
      /UPDATE\s+public\.membership_expiry_extension_batches\s+SET\s+([\s\S]*?)\s+WHERE\s+([\s\S]*?)\s*;/i,
    )
    const persistedValues = persistedBatchResult?.[1] ?? ''
    const persistedBatchWhere = persistedBatchResult?.[2].replace(/\s+/g, ' ').trim() ?? ''

    expect(persistedValues).toMatch(/\baffected_count\s*=\s*v_affected_count\b/i)
    expect(persistedValues).toMatch(/\bresult\s*=\s*v_result\b/i)
    expect(persistedBatchWhere).toMatch(
      /^(?:\w+\.)?idempotency_key\s*=\s*p_idempotency_key$/i,
    )
  })

  it('requires a reason and records one batch audit action', () => {
    expect(applySql).toMatch(/(?:btrim|trim)\s*\(\s*p_reason\s*\)/i)
    expect(applySql).toMatch(/RAISE EXCEPTION[\s\S]*?(?:motivo|reason)/i)
    expect(applySql).toMatch(/public\.log_admin_action\s*\(/i)
  })

  it('enables RLS, permits admin reads, and denies direct client writes to batches', () => {
    expect(executableSql).toMatch(
      /ALTER TABLE public\.membership_expiry_extension_batches ENABLE ROW LEVEL SECURITY;/i,
    )
    const adminSelectPolicy = executableSql.match(
      /CREATE POLICY[^;]*?ON public\.membership_expiry_extension_batches[^;]*?;/i,
    )?.[0] ?? ''

    expect(adminSelectPolicy).toMatch(/FOR SELECT/i)
    expect(adminSelectPolicy).toMatch(/TO authenticated/i)
    expect(adminSelectPolicy).toMatch(/USING[\s\S]*?public\.is_admin_user\(\)/i)
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(executableSql).toMatch(
        new RegExp(
          `REVOKE ALL ON (?:TABLE )?public\\.membership_expiry_extension_batches FROM [^;]*\\b${role}\\b[^;]*;`,
          'i',
        ),
      )
    }
    expect(executableSql).toMatch(
      /GRANT SELECT ON (?:TABLE )?public\.membership_expiry_extension_batches TO authenticated;/i,
    )
    expect(executableSql).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*membership_expiry_extension_batches\s+TO\s+(?:anon|authenticated)/i,
    )
  })

  it('keeps both SECURITY DEFINER RPCs admin-only with a fixed search path', () => {
    for (const rpcSql of [previewSql, applySql]) {
      expect(rpcSql).toMatch(/SECURITY DEFINER/i)
      expect(rpcSql).toMatch(/SET search_path\s*(?:=|TO)\s*public/i)
      expect(rpcSql).toMatch(
        /IF\s+auth\.uid\(\)\s+IS\s+NULL\s+THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?END IF;/i,
      )
      expect(rpcSql).toMatch(
        /IF\s+NOT\s+public\.is_admin_user\(\)\s+THEN[\s\S]*?RAISE EXCEPTION[\s\S]*?END IF;/i,
      )
    }

    for (const signature of [
      'admin_preview_bulk_membership_expiry_extension()',
      'admin_apply_bulk_membership_expiry_extension(text, uuid)',
    ]) {
      const escapedSignature = signature.replace(/[().]/g, '\\$&')
      expect(executableSql).toMatch(
        new RegExp(
          `REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${escapedSignature} FROM PUBLIC;`,
          'i',
        ),
      )
      expect(executableSql).toMatch(
        new RegExp(
          `REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${escapedSignature} FROM anon;`,
          'i',
        ),
      )
      expect(executableSql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escapedSignature} TO authenticated;`, 'i'),
      )
      expect(executableSql).toMatch(
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
