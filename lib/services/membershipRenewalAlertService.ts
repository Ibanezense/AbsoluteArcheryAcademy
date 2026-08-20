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

const ALERT_STATES = new Set<MembershipRenewalAlertState>([
  'none',
  'last_class',
  'expired',
])

function normalizeAlertState(value: unknown): MembershipRenewalAlertState {
  return typeof value === 'string' && ALERT_STATES.has(value as MembershipRenewalAlertState)
    ? value as MembershipRenewalAlertState
    : 'none'
}

function normalizeRemainingClasses(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function normalizeAlertRow(value: unknown): MembershipRenewalAlert | null {
  if (!value || typeof value !== 'object') return null

  const row = value as Record<string, unknown>
  if (typeof row.student_id !== 'string' || row.student_id.length === 0) return null

  return {
    student_id: row.student_id,
    alert_state: normalizeAlertState(row.alert_state),
    remaining_unconsumed_classes: normalizeRemainingClasses(row.remaining_unconsumed_classes),
    has_current_membership: row.has_current_membership === true,
    has_scheduled_membership: row.has_scheduled_membership === true,
    state_key: typeof row.state_key === 'string' ? row.state_key : '',
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
    if (alert) alerts[alert.student_id] = alert
    return alerts
  }, {})
}
