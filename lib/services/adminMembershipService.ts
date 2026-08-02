export type MembershipPaymentType =
  | 'manual'
  | 'cash'
  | 'card'
  | 'transfer'
  | 'yape'
  | 'plin'

export type MembershipDiscountType = 'none' | 'amount' | 'percentage'

interface MembershipCycleInputBase {
  studentId: string
  startDate: string
  notes?: string
  idempotencyKey?: string
}

export interface PaidMembershipCycleInput extends MembershipCycleInputBase {
  origin: 'paid'
  membershipPlanId: string
  periodCount: number
  totalAmountPerCycle: number
  batchPaymentAmount: number
  paymentType?: MembershipPaymentType
  discountType?: MembershipDiscountType
  discountValue?: number
}

export interface GiftMembershipCycleInput extends MembershipCycleInputBase {
  origin: 'gift'
  giftClasses: number
  giftEndDate: string
}

export type MembershipCycleInput =
  | PaidMembershipCycleInput
  | GiftMembershipCycleInput

export interface CreatedMembershipCycle {
  id: string
  student_id: string
  membership_plan_id: string | null
  legacy_profile_membership_id: string | null
  custom_name: string
  classes_total: number
  classes_used: number
  classes_remaining: number
  start_date: string
  end_date: string | null
  status: 'draft' | 'active' | 'expired' | 'cancelled' | 'consumed' | 'historical'
  total_amount: number
  currency: string
  notes: string | null
  sold_by_profile_id: string | null
  document_number: string | null
  payment_type: MembershipPaymentType
  billing_date: string | null
  discount_type: MembershipDiscountType
  discount_value: number
  frozen_at: string | null
  frozen_until: string | null
  membership_origin: 'paid' | 'gift'
  assignment_batch_id: string | null
  created_at: string
  updated_at: string
}

type RpcError = {
  message?: string
}

export type RpcPayload = {
  p_student_id: string
  p_membership_plan_id: string | null
  p_start_date: string
  p_period_count: number
  p_origin: 'paid' | 'gift'
  p_gift_classes: number | null
  p_gift_end_date: string | null
  p_total_amount: number
  p_payment_amount: number
  p_payment_type: MembershipPaymentType | null
  p_discount_type: MembershipDiscountType | null
  p_discount_value: number | null
  p_notes: string | null
  p_idempotency_key: string
}

type RpcClient = {
  rpc: (
    functionName: 'admin_create_student_membership_cycles',
    payload: RpcPayload,
  ) => PromiseLike<{
    data: CreatedMembershipCycle[] | null
    error: RpcError | null
  }>
}

export async function createStudentMembershipCycles(
  client: RpcClient,
  input: MembershipCycleInput,
): Promise<CreatedMembershipCycle[]> {
  const idempotencyKey = input.idempotencyKey ?? globalThis.crypto.randomUUID()
  const paid = input.origin === 'paid'

  const { data, error } = await client.rpc(
    'admin_create_student_membership_cycles',
    {
      p_student_id: input.studentId,
      p_membership_plan_id: paid ? input.membershipPlanId : null,
      p_start_date: input.startDate,
      p_period_count: paid ? input.periodCount : 1,
      p_origin: input.origin,
      p_gift_classes: paid ? null : input.giftClasses,
      p_gift_end_date: paid ? null : input.giftEndDate,
      p_total_amount: paid ? input.totalAmountPerCycle : 0,
      p_payment_amount: paid ? input.batchPaymentAmount : 0,
      p_payment_type: paid ? input.paymentType ?? null : null,
      p_discount_type: paid ? input.discountType ?? null : null,
      p_discount_value: paid ? input.discountValue ?? null : null,
      p_notes: input.notes ?? null,
      p_idempotency_key: idempotencyKey,
    },
  )

  if (error) {
    throw new Error(error.message || 'No se pudieron crear las membresias.')
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('La asignacion no devolvio membresias.')
  }

  return data
}
