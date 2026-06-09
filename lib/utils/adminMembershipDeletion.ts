export type DeletableMembershipState = {
  status: string | null | undefined
  end_date: string | null | undefined
}

const CLOSED_MEMBERSHIP_STATUSES = new Set(['expired', 'historical', 'cancelled', 'consumed'])

export function getTodayLocalISODate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function canDeleteExpiredMembership(
  membership: DeletableMembershipState,
  today: string = getTodayLocalISODate(),
) {
  const status = membership.status || ''

  if (CLOSED_MEMBERSHIP_STATUSES.has(status)) return true
  return status === 'active' && !!membership.end_date && membership.end_date < today
}
