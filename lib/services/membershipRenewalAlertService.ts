import type { MembershipRenewalAlertState } from '@/lib/utils/membershipRenewal'

export type MembershipRenewalAlert = {
  student_id: string
  alert_state: MembershipRenewalAlertState
  remaining_unconsumed_classes: number
  has_current_membership: boolean
  has_scheduled_membership: boolean
  state_key: string
}

export type MembershipRenewalAlertMap = Record<string, MembershipRenewalAlert>

function canonicalizeStudentIds(studentIds: readonly string[]) {
  return [...new Set(studentIds)].sort()
}

export const membershipRenewalAlertKeys = {
  all: ['membership-renewal-alerts'] as const,
  list: (studentIds: readonly string[]) => [
    ...membershipRenewalAlertKeys.all,
    canonicalizeStudentIds(studentIds),
  ] as const,
}

type RpcError = {
  message?: string
}

type MembershipRenewalAlertRpcClient = {
  rpc: (
    functionName: 'get_membership_renewal_alert_states',
    payload: { p_student_ids: string[] },
  ) => PromiseLike<{
    data: unknown
    error: RpcError | null
  }>
}

function isAlertState(value: unknown): value is MembershipRenewalAlertState {
  return value === 'none' || value === 'last_class' || value === 'expired'
}

function normalizeAlertRow(value: unknown): MembershipRenewalAlert | null {
  if (!value || typeof value !== 'object') return null

  const row = value as Record<string, unknown>
  if (typeof row.student_id !== 'string' || row.student_id.trim().length === 0) return null
  if (!isAlertState(row.alert_state)) return null
  if (
    typeof row.remaining_unconsumed_classes !== 'number'
    || !Number.isFinite(row.remaining_unconsumed_classes)
    || !Number.isInteger(row.remaining_unconsumed_classes)
    || row.remaining_unconsumed_classes < 0
  ) return null
  if (typeof row.has_current_membership !== 'boolean') return null
  if (typeof row.has_scheduled_membership !== 'boolean') return null
  if (typeof row.state_key !== 'string' || row.state_key.trim().length === 0) return null

  if (
    row.alert_state === 'last_class'
    && (
      row.remaining_unconsumed_classes !== 1
      || !row.has_current_membership
    )
  ) return null

  if (
    row.alert_state === 'expired'
    && (
      row.remaining_unconsumed_classes !== 0
      || row.has_current_membership
      || row.has_scheduled_membership
    )
  ) return null

  return {
    student_id: row.student_id,
    alert_state: row.alert_state,
    remaining_unconsumed_classes: row.remaining_unconsumed_classes,
    has_current_membership: row.has_current_membership,
    has_scheduled_membership: row.has_scheduled_membership,
    state_key: row.state_key,
  }
}

export async function getMembershipRenewalAlerts(
  client: MembershipRenewalAlertRpcClient,
  studentIds: readonly string[],
): Promise<MembershipRenewalAlertMap> {
  if (studentIds.length === 0) return {}

  const { data, error } = await client.rpc(
    'get_membership_renewal_alert_states',
    { p_student_ids: [...studentIds] },
  )

  if (error) {
    throw new Error(error.message || 'No se pudieron cargar los avisos de membresia.')
  }

  if (!Array.isArray(data)) return {}

  return data.reduce<MembershipRenewalAlertMap>((alerts, value) => {
    const alert = normalizeAlertRow(value)
    if (alert && !Object.prototype.hasOwnProperty.call(alerts, alert.student_id)) {
      alerts[alert.student_id] = alert
    }
    return alerts
  }, {})
}
