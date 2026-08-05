import { describe, expect, it, vi } from 'vitest'
import {
  createStudentMembershipCycles,
  type CreatedMembershipCycle,
} from '@/lib/services/adminMembershipService'

function rpcClient(result: {
  data: CreatedMembershipCycle[] | null
  error: { message?: string } | null
}) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe('createStudentMembershipCycles', () => {
  it('sends the exact paid-cycle RPC contract', async () => {
    const rows = [{ id: 'membership-1' }] as CreatedMembershipCycle[]
    const client = rpcClient({ data: rows, error: null })

    const result: CreatedMembershipCycle[] = await createStudentMembershipCycles(client, {
      origin: 'paid',
      studentId: 'student-1',
      membershipPlanId: 'plan-1',
      startDate: '2026-08-01',
      periodCount: 2,
      totalAmountPerCycle: 180,
      batchPaymentAmount: 360,
      paymentType: 'yape',
      discountType: 'percentage',
      discountValue: 10,
      billingDate: '2026-08-05',
      notes: 'Pago anticipado',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    })

    expect(client.rpc).toHaveBeenCalledWith(
      'admin_create_student_membership_cycles',
      {
        p_student_id: 'student-1',
        p_membership_plan_id: 'plan-1',
        p_start_date: '2026-08-01',
        p_period_count: 2,
        p_origin: 'paid',
        p_gift_classes: null,
        p_gift_end_date: null,
        p_total_amount: 180,
        p_payment_amount: 360,
        p_payment_type: 'yape',
        p_discount_type: 'percentage',
        p_discount_value: 10,
        p_notes: 'Pago anticipado',
        p_billing_date: '2026-08-05',
        p_idempotency_key: '00000000-0000-4000-8000-000000000001',
      },
    )
    expect(result).toBe(rows)
  })

  it('normalizes a gift cycle to one free period and null optionals', async () => {
    const client = rpcClient({
      data: [{ id: 'gift-membership' }] as CreatedMembershipCycle[],
      error: null,
    })

    await createStudentMembershipCycles(client, {
      origin: 'gift',
      studentId: 'student-1',
      startDate: '2026-10-01',
      giftClasses: 1,
      giftEndDate: '2026-10-31',
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    })

    expect(client.rpc).toHaveBeenCalledWith(
      'admin_create_student_membership_cycles',
      {
        p_student_id: 'student-1',
        p_membership_plan_id: null,
        p_start_date: '2026-10-01',
        p_period_count: 1,
        p_origin: 'gift',
        p_gift_classes: 1,
        p_gift_end_date: '2026-10-31',
        p_total_amount: 0,
        p_payment_amount: 0,
        p_payment_type: null,
        p_discount_type: null,
        p_discount_value: null,
        p_notes: null,
        p_billing_date: null,
        p_idempotency_key: '00000000-0000-4000-8000-000000000002',
      },
    )
  })

  it('generates one idempotency key per invocation when omitted', async () => {
    const client = rpcClient({
      data: [{ id: 'generated-membership' }] as CreatedMembershipCycle[],
      error: null,
    })
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000003')

    await createStudentMembershipCycles(client, {
      origin: 'gift',
      studentId: 'student-1',
      startDate: '2026-10-01',
      giftClasses: 1,
      giftEndDate: '2026-10-31',
    })

    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith(
      'admin_create_student_membership_cycles',
      expect.objectContaining({
        p_idempotency_key: '00000000-0000-4000-8000-000000000003',
      }),
    )
  })

  it('throws the Supabase error instead of returning data', async () => {
    const client = rpcClient({ data: null, error: { message: 'Plan inactivo' } })

    await expect(
      createStudentMembershipCycles(client, {
        origin: 'paid',
        studentId: 'student-1',
        membershipPlanId: 'plan-1',
        startDate: '2026-08-01',
        periodCount: 1,
        totalAmountPerCycle: 180,
        batchPaymentAmount: 180,
        idempotencyKey: '00000000-0000-4000-8000-000000000004',
      }),
    ).rejects.toThrow('Plan inactivo')
  })

  it('rejects a null successful response', async () => {
    const client = rpcClient({ data: null, error: null })

    await expect(
      createStudentMembershipCycles(client, {
        origin: 'gift',
        studentId: 'student-1',
        startDate: '2026-10-01',
        giftClasses: 1,
        giftEndDate: '2026-10-31',
        idempotencyKey: '00000000-0000-4000-8000-000000000005',
      }),
    ).rejects.toThrow('La asignacion no devolvio membresias.')
  })

  it('rejects an empty successful response', async () => {
    const client = rpcClient({ data: [], error: null })

    await expect(
      createStudentMembershipCycles(client, {
        origin: 'gift',
        studentId: 'student-1',
        startDate: '2026-10-01',
        giftClasses: 1,
        giftEndDate: '2026-10-31',
        idempotencyKey: '00000000-0000-4000-8000-000000000006',
      }),
    ).rejects.toThrow('La asignacion no devolvio membresias.')
  })
})
