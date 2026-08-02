export type MembershipDeletionPreview = {
  can_delete: boolean
  reason?: string | null
  booking_count: number
  payment_count: number
  ledger_count: number
  weekly_attendance_count: number
}

export type MembershipDeletionResult = {
  success: boolean
  error?: string | null
  booking_count?: number | null
  payment_count?: number | null
  ledger_count?: number | null
  membership_count?: number | null
}

export function isPersistedMembership<T extends { id: string | null | undefined }>(membership: T) {
  return Boolean(membership.id?.trim())
}

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

// Kept for the student-detail screen until its older deletion flow is migrated.
export function canDeleteExpiredMembership(
  membership: DeletableMembershipState,
  today: string = getTodayLocalISODate(),
) {
  const status = membership.status || ''

  if (CLOSED_MEMBERSHIP_STATUSES.has(status)) return true
  return status === 'active' && !!membership.end_date && membership.end_date < today
}

function count(value: number | null | undefined) {
  return Number(value || 0)
}

export function buildMembershipDeletionConfirmation(
  membershipName: string,
  preview: MembershipDeletionPreview,
) {
  return [
    `Membresia: ${membershipName}`,
    `Reservas vinculadas: ${count(preview.booking_count)}`,
    `Pagos vinculados: ${count(preview.payment_count)}`,
    `Movimientos de credito: ${count(preview.ledger_count)}`,
    '',
    'Esta accion es irreversible.',
  ].join('\n')
}

export function formatMembershipDeletionSuccess(result: MembershipDeletionResult) {
  return `Membresia eliminada: ${count(result.booking_count)} reservas, ${count(result.payment_count)} pagos y ${count(result.ledger_count)} movimientos eliminados.`
}
