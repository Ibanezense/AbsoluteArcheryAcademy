import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  getMembershipRenewalAlerts,
  membershipRenewalAlertKeys,
  type MembershipRenewalAlert,
} from '@/lib/services/membershipRenewalAlertService'

function rpcClient(result: {
  data: unknown
  error: { message?: string } | null
}) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe('getMembershipRenewalAlerts', () => {
  it('calls the batch RPC with the requested student IDs', async () => {
    const client = rpcClient({ data: [], error: null })

    await getMembershipRenewalAlerts(client, ['student-1', 'student-2'])

    expect(client.rpc).toHaveBeenCalledWith(
      'get_membership_renewal_alert_states',
      { p_student_ids: ['student-1', 'student-2'] },
    )
  })

  it('does not call Supabase when the input is empty', async () => {
    const client = rpcClient({ data: [], error: null })

    const result = await getMembershipRenewalAlerts(client, [])

    expect(result).toEqual({})
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('normalizes rows into a map keyed by student_id', async () => {
    const rows: MembershipRenewalAlert[] = [
      {
        student_id: 'student-1',
        alert_state: 'last_class',
        remaining_unconsumed_classes: 1,
        has_current_membership: true,
        has_scheduled_membership: false,
        state_key: 'last_class:cycle-a',
      },
      {
        student_id: 'student-2',
        alert_state: 'expired',
        remaining_unconsumed_classes: 0,
        has_current_membership: false,
        has_scheduled_membership: false,
        state_key: 'expired:cycle-b',
      },
    ]
    const client = rpcClient({ data: rows, error: null })

    const result = await getMembershipRenewalAlerts(client, ['student-1', 'student-2'])

    expect(result).toEqual({
      'student-1': rows[0],
      'student-2': rows[1],
    })
  })

  it('returns an empty map for a null or non-array response', async () => {
    const nullClient = rpcClient({ data: null, error: null })
    const objectClient = rpcClient({ data: { student_id: 'student-1' }, error: null })

    await expect(getMembershipRenewalAlerts(nullClient, ['student-1'])).resolves.toEqual({})
    await expect(getMembershipRenewalAlerts(objectClient, ['student-1'])).resolves.toEqual({})
  })

  it('rejects with the RPC error message', async () => {
    const client = rpcClient({ data: null, error: { message: 'Acceso denegado' } })

    await expect(getMembershipRenewalAlerts(client, ['student-1']))
      .rejects.toThrow('Acceso denegado')
  })

  it('normalizes unsafe row values and ignores rows without a student ID', async () => {
    const client = rpcClient({
      data: [
        {
          student_id: 'student-1',
          alert_state: 'unexpected_state',
          remaining_unconsumed_classes: -4.8,
          has_current_membership: 'yes',
          has_scheduled_membership: true,
          state_key: null,
        },
        {
          student_id: '',
          alert_state: 'expired',
        },
      ],
      error: null,
    })

    const result = await getMembershipRenewalAlerts(client, ['student-1'])

    expect(result).toEqual({
      'student-1': {
        student_id: 'student-1',
        alert_state: 'none',
        remaining_unconsumed_classes: 0,
        has_current_membership: false,
        has_scheduled_membership: true,
        state_key: '',
      },
    })
  })
})

describe('membershipRenewalAlertKeys', () => {
  it('deduplicates and sorts student IDs for a stable batch key', () => {
    expect(membershipRenewalAlertKeys.list(['student-2', 'student-1', 'student-2']))
      .toEqual(['membership-renewal-alerts', ['student-1', 'student-2']])
  })
})

describe('membership renewal cache synchronization', () => {
  it('invalidates renewal alerts, all students and dashboards after both renewal mutations', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/hooks/useMembershipRenewal.ts'),
      'utf8',
    )

    expect(source.match(/invalidateQueries\(\{ queryKey: membershipRenewalAlertKeys\.all \}\)/g))
      .toHaveLength(2)
    expect(source.match(/invalidateQueries\(\{ queryKey: studentKeys\.all \}\)/g))
      .toHaveLength(2)
    expect(source.match(/invalidateQueries\(\{ queryKey: \['student-dashboard'\] \}\)/g))
      .toHaveLength(2)
  })
})
