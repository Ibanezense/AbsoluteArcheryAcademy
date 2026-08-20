import type { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { invalidateMembershipRenewalCaches } from '@/lib/hooks/useMembershipRenewal'
import { studentKeys } from '@/lib/queries/studentQueries'
import {
  getMembershipRenewalAlerts,
  membershipRenewalAlertKeys,
  type MembershipRenewalAlert,
} from '@/lib/services/membershipRenewalAlertService'

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))

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

  it('drops rows with unsafe values instead of fabricating an alert', async () => {
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

    expect(result).toEqual({})
  })

  it.each([
    {
      label: 'partial last_class',
      row: {
        student_id: 'student-1',
        alert_state: 'last_class',
        remaining_unconsumed_classes: 1,
        state_key: 'last_class:cycle-a',
      },
    },
    {
      label: 'contradictory expired',
      row: {
        student_id: 'student-1',
        alert_state: 'expired',
        remaining_unconsumed_classes: 0,
        has_current_membership: true,
        has_scheduled_membership: false,
        state_key: 'expired:cycle-a',
      },
    },
    {
      label: 'last_class with a scheduled membership',
      row: {
        student_id: 'student-1',
        alert_state: 'last_class',
        remaining_unconsumed_classes: 1,
        has_current_membership: true,
        has_scheduled_membership: true,
        state_key: 'last_class:cycle-a',
      },
    },
    {
      label: 'empty state key',
      row: {
        student_id: 'student-1',
        alert_state: 'last_class',
        remaining_unconsumed_classes: 1,
        has_current_membership: true,
        has_scheduled_membership: false,
        state_key: '   ',
      },
    },
  ])('drops a $label row', async ({ row }) => {
    const client = rpcClient({ data: [row], error: null })

    await expect(getMembershipRenewalAlerts(client, ['student-1']))
      .resolves.toEqual({})
  })

  it('accepts a fully shaped none row', async () => {
    const row: MembershipRenewalAlert = {
      student_id: 'student-1',
      alert_state: 'none',
      remaining_unconsumed_classes: 4,
      has_current_membership: true,
      has_scheduled_membership: false,
      state_key: 'none:cycle-a',
    }
    const client = rpcClient({ data: [row], error: null })

    await expect(getMembershipRenewalAlerts(client, ['student-1']))
      .resolves.toEqual({ 'student-1': row })
  })

  it.each([Number.POSITIVE_INFINITY, 1.5])(
    'drops a row with a non-finite or fractional class balance (%s)',
    async (remainingClasses) => {
      const client = rpcClient({
        data: [{
          student_id: 'student-1',
          alert_state: 'none',
          remaining_unconsumed_classes: remainingClasses,
          has_current_membership: true,
          has_scheduled_membership: false,
          state_key: 'none:cycle-a',
        }],
        error: null,
      })

      await expect(getMembershipRenewalAlerts(client, ['student-1']))
        .resolves.toEqual({})
    },
  )

  it('keeps the first valid duplicate row deterministically', async () => {
    const first: MembershipRenewalAlert = {
      student_id: 'student-1',
      alert_state: 'last_class',
      remaining_unconsumed_classes: 1,
      has_current_membership: true,
      has_scheduled_membership: false,
      state_key: 'last_class:first',
    }
    const duplicate: MembershipRenewalAlert = {
      student_id: 'student-1',
      alert_state: 'expired',
      remaining_unconsumed_classes: 0,
      has_current_membership: false,
      has_scheduled_membership: false,
      state_key: 'expired:duplicate',
    }
    const client = rpcClient({ data: [first, duplicate], error: null })

    await expect(getMembershipRenewalAlerts(client, ['student-1']))
      .resolves.toEqual({ 'student-1': first })
  })
})

describe('membershipRenewalAlertKeys', () => {
  it('deduplicates and sorts student IDs for a stable batch key', () => {
    expect(membershipRenewalAlertKeys.list(['student-2', 'student-1', 'student-2']))
      .toEqual(['membership-renewal-alerts', ['student-1', 'student-2']])
  })
})

describe('membership renewal cache synchronization', () => {
  it('invalidates renewal alerts, all students and dashboards behaviorally', () => {
    const invalidateQueries = vi.fn()
    const queryClient = {
      invalidateQueries,
    } as unknown as Pick<QueryClient, 'invalidateQueries'>

    invalidateMembershipRenewalCaches(queryClient)

    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      membershipRenewalAlertKeys.all,
      studentKeys.all,
      ['student-dashboard'],
    ])
  })
})
