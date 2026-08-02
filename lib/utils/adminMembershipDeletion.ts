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

function invalidResponse(detail: string): never {
  throw new Error(`Respuesta invalida del servidor: ${detail}.`)
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidResponse('se esperaba un objeto')
  }
  return value as Record<string, unknown>
}

function responseCount(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return invalidResponse(`${field} debe ser un entero no negativo`)
  }
  return value
}

function optionalResponseString(value: unknown, field: string) {
  if (value === undefined || value === null) return value
  if (typeof value !== 'string') return invalidResponse(`${field} debe ser texto`)
  return value
}

function optionalResponseCount(payload: Record<string, unknown>, field: string) {
  return field in payload ? responseCount(payload[field], field) : undefined
}

export function parseMembershipDeletionPreview(value: unknown): MembershipDeletionPreview {
  const payload = responseRecord(value)
  if (typeof payload.can_delete !== 'boolean') {
    return invalidResponse('can_delete debe ser booleano')
  }

  return {
    can_delete: payload.can_delete,
    reason: optionalResponseString(payload.reason, 'reason'),
    booking_count: responseCount(payload.booking_count, 'booking_count'),
    payment_count: responseCount(payload.payment_count, 'payment_count'),
    ledger_count: responseCount(payload.ledger_count, 'ledger_count'),
    weekly_attendance_count: responseCount(payload.weekly_attendance_count, 'weekly_attendance_count'),
  }
}

export function parseMembershipDeletionResult(value: unknown): MembershipDeletionResult {
  const payload = responseRecord(value)
  if (typeof payload.success !== 'boolean') {
    return invalidResponse('success debe ser booleano')
  }

  const error = optionalResponseString(payload.error, 'error')
  if (!payload.success) {
    const result: MembershipDeletionResult = { success: false, error }
    for (const field of ['booking_count', 'payment_count', 'ledger_count', 'membership_count'] as const) {
      const parsedCount = optionalResponseCount(payload, field)
      if (parsedCount !== undefined) result[field] = parsedCount
    }
    return result
  }

  return {
    success: true,
    error,
    booking_count: responseCount(payload.booking_count, 'booking_count'),
    payment_count: responseCount(payload.payment_count, 'payment_count'),
    ledger_count: responseCount(payload.ledger_count, 'ledger_count'),
    membership_count: responseCount(payload.membership_count, 'membership_count'),
  }
}

export function isPersistedMembership<T extends { id: string | null | undefined }>(membership: T) {
  return Boolean(membership.id?.trim())
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
