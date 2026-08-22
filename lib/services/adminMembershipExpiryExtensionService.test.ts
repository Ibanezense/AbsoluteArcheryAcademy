import { describe, expect, it, vi } from 'vitest'
import {
  applyBulkMembershipExpiryExtension,
  previewBulkMembershipExpiryExtension,
  type MembershipExpiryExtension,
} from '@/lib/services/adminMembershipExpiryExtensionService'

function rpcClient(data: unknown, error: { message?: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  }
}

describe('adminMembershipExpiryExtensionService', () => {
  it('requests the preview RPC without parameters', async () => {
    const client = rpcClient({ affected_count: 0, extensions: [] })

    const result = await previewBulkMembershipExpiryExtension(client)

    expect(client.rpc).toHaveBeenCalledWith(
      'admin_preview_bulk_membership_expiry_extension',
    )
    expect(result).toEqual({ affected_count: 0, extensions: [] })
  })

  it('trims the reason and sends the apply RPC contract', async () => {
    const client = rpcClient({
      affected_count: 0,
      extensions: [],
      already_applied: false,
    })

    await applyBulkMembershipExpiryExtension(client, {
      reason: '  Feriado institucional  ',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    })

    expect(client.rpc).toHaveBeenCalledWith(
      'admin_apply_bulk_membership_expiry_extension',
      {
        p_reason: 'Feriado institucional',
        p_idempotency_key: '00000000-0000-4000-8000-000000000001',
      },
    )
  })

  it.each([
    null,
    undefined,
    'unexpected',
    [],
    { affected_count: '2' },
    { affected_count: 1, extensions: [{ membership_id: 'incomplete' }] },
  ])(
    'normalizes malformed RPC data (%j) to an empty result',
    async (data) => {
      const client = rpcClient(data)

      await expect(previewBulkMembershipExpiryExtension(client)).resolves.toEqual({
        affected_count: 0,
        extensions: [],
      })
    },
  )

  it('preserves valid extension and batch result fields', async () => {
    const extension: MembershipExpiryExtension = {
      student_id: 'student-1',
      student_name: 'Ana Arquera',
      membership_id: 'membership-1',
      membership_name: 'Plan mensual',
      current_end_date: '2026-08-31',
      new_end_date: '2026-09-07',
    }
    const client = rpcClient({
      affected_count: 1,
      extensions: [extension],
      already_applied: true,
      batch_id: '00000000-0000-4000-8000-000000000002',
      ignored: 'not part of the contract',
    })

    const result = await applyBulkMembershipExpiryExtension(client, {
      reason: 'Cierre temporal',
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    })

    expect(result).toEqual({
      affected_count: 1,
      extensions: [extension],
      already_applied: true,
      batch_id: '00000000-0000-4000-8000-000000000002',
    })
  })

  it.each([
    { affected_count: 2, extensions: [] },
    {
      affected_count: 0,
      extensions: [
        {
          student_id: 'student-1',
          student_name: 'Ana Arquera',
          membership_id: 'membership-1',
          membership_name: 'Plan mensual',
          current_end_date: '2026-08-31',
          new_end_date: '2026-09-07',
        },
      ],
    },
  ])(
    'normalizes an inconsistent count and extension list to an empty result',
    async (data) => {
      const client = rpcClient(data)

      await expect(previewBulkMembershipExpiryExtension(client)).resolves.toEqual({
        affected_count: 0,
        extensions: [],
      })
    },
  )

  it('reports preview RPC errors with a clear Spanish Error', async () => {
    const client = rpcClient(null, { message: 'permission denied' })

    await expect(previewBulkMembershipExpiryExtension(client)).rejects.toEqual(
      new Error(
        'No se pudo cargar la vista previa de vencimientos: permission denied',
      ),
    )
  })

  it('reports apply RPC errors with a clear Spanish Error', async () => {
    const client = rpcClient(null, { message: 'transaction aborted' })

    await expect(
      applyBulkMembershipExpiryExtension(client, {
        reason: 'Cierre temporal',
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
      }),
    ).rejects.toEqual(
      new Error(
        'No se pudieron retrasar los vencimientos: transaction aborted',
      ),
    )
  })

  it('rejects an empty reason before calling the apply RPC', async () => {
    const client = rpcClient({ affected_count: 0, extensions: [] })

    await expect(
      applyBulkMembershipExpiryExtension(client, {
        reason: '   ',
        idempotencyKey: '00000000-0000-4000-8000-000000000004',
      }),
    ).rejects.toEqual(new Error('El motivo es obligatorio.'))
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
