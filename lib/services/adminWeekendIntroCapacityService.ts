import type { WeekendIntroCapacitySession } from '@/lib/utils/weekendIntroCapacity'

type RpcError = {
  message?: string
}

type AdminWeekendIntroCapacityRpcClient = {
  rpc: (
    functionName: 'admin_get_weekend_intro_capacity',
    payload: { p_reference_date: string },
  ) => PromiseLike<{
    data: unknown
    error: RpcError | null
  }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
}

function normalizeCapacityRow(value: unknown, index: number): WeekendIntroCapacitySession {
  if (!value || typeof value !== 'object') {
    throw new Error(`La capacidad de la sesión ${index + 1} es inválida.`)
  }

  const row = value as Record<string, unknown>
  const isValid = isValidUuid(row.session_id)
    && isValidDateString(row.start_at)
    && isValidDateString(row.end_at)
    && isNonNegativeInteger(row.equipment_capacity)
    && isNonNegativeInteger(row.equipment_reserved)
    && isNonNegativeInteger(row.spots_remaining)
    && row.spots_remaining <= row.equipment_capacity

  if (!isValid) {
    throw new Error(`La capacidad de la sesión ${index + 1} es inválida.`)
  }

  return {
    sessionId: row.session_id as string,
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    equipmentCapacity: row.equipment_capacity as number,
    equipmentReserved: row.equipment_reserved as number,
    spotsRemaining: row.spots_remaining as number,
  }
}

export async function fetchAdminWeekendIntroCapacity(
  client: AdminWeekendIntroCapacityRpcClient,
  referenceDate: string,
): Promise<WeekendIntroCapacitySession[]> {
  const { data, error } = await client.rpc('admin_get_weekend_intro_capacity', {
    p_reference_date: referenceDate,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo cargar la capacidad del fin de semana.')
  }

  if (data === null) return []
  if (!Array.isArray(data)) {
    throw new Error('La capacidad del fin de semana devolvió un formato inválido.')
  }

  return data.map(normalizeCapacityRow)
}
