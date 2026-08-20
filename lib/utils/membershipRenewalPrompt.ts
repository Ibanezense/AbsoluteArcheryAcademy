import type { MembershipRenewalAlert } from '@/lib/services/membershipRenewalAlertService'

export type VisibleMembershipRenewalAlert = MembershipRenewalAlert & {
  alert_state: 'last_class' | 'expired'
}

export type RenewalPromptStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type RenewalPromptStorageSource =
  | RenewalPromptStorage
  | (() => RenewalPromptStorage | null | undefined)
  | null
  | undefined

export type ValidatedRenewalOption = {
  plan_id: string
  name: string
  classes_included: number
  duration_days: number | null
  regular_price: number
  country_club_price: number | null
  effective_price: number
  currency: string
  is_country_club_member: boolean
}

function resolveStorage(source: RenewalPromptStorageSource) {
  return typeof source === 'function' ? source() : source
}

export function getDismissedRenewalPrompt(
  storageSource: RenewalPromptStorageSource,
  key: string,
) {
  try {
    return resolveStorage(storageSource)?.getItem(key) === '1'
  } catch {
    return false
  }
}

export function setDismissedRenewalPrompt(
  storageSource: RenewalPromptStorageSource,
  key: string,
) {
  try {
    const storage = resolveStorage(storageSource)
    if (!storage) return false
    storage.setItem(key, '1')
    return true
  } catch {
    return false
  }
}

export function getVisibleRenewalAlert(
  alert: MembershipRenewalAlert | null | undefined,
): VisibleMembershipRenewalAlert | null {
  if (
    !alert
    || (alert.alert_state !== 'last_class' && alert.alert_state !== 'expired')
    || typeof alert.state_key !== 'string'
    || !alert.state_key.trim()
  ) return null

  return alert as VisibleMembershipRenewalAlert
}

export function shouldOpenMembershipRenewalPrompt(input: {
  contextReady: boolean
  queryReady: boolean
  isAdmin: boolean
  alert: VisibleMembershipRenewalAlert | null
  dismissalKey: string | null
  checkedDismissalKey: string | null
  dismissed: boolean
  manualOpen: boolean
}) {
  return input.contextReady
    && input.queryReady
    && !input.isAdmin
    && !!input.alert
    && !!input.dismissalKey
    && input.checkedDismissalKey === input.dismissalKey
    && (input.manualOpen || !input.dismissed)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidatedRenewalOption(value: unknown): value is ValidatedRenewalOption {
  if (!value || typeof value !== 'object') return false
  const option = value as Record<string, unknown>

  return typeof option.plan_id === 'string'
    && option.plan_id.trim().length > 0
    && typeof option.name === 'string'
    && Number.isInteger(option.classes_included)
    && Number(option.classes_included) > 0
    && (
      option.duration_days === null
      || (Number.isInteger(option.duration_days) && Number(option.duration_days) > 0)
    )
    && isFiniteNumber(option.regular_price)
    && (
      option.country_club_price === null
      || isFiniteNumber(option.country_club_price)
    )
    && isFiniteNumber(option.effective_price)
    && typeof option.currency === 'string'
    && option.currency.trim().length > 0
    && typeof option.is_country_club_member === 'boolean'
}

export function getValidatedRenewalOptions(value: unknown): {
  options: ValidatedRenewalOption[]
  malformed: boolean
} {
  if (!Array.isArray(value)) {
    return { options: [], malformed: value !== undefined }
  }

  if (!value.every(isValidatedRenewalOption)) {
    return { options: [], malformed: true }
  }

  return { options: value, malformed: false }
}
