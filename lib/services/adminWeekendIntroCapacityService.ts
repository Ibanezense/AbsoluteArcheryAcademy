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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const RFC3339_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  return 31
}

function parseRfc3339Timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = RFC3339_TIMESTAMP_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[8] === undefined ? 0 : Number(match[8])
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9])

  if (
    month < 1
    || month > 12
    || day < 1
    || day > getDaysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) return null

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
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
  const startTime = parseRfc3339Timestamp(row.start_at)
  const endTime = parseRfc3339Timestamp(row.end_at)
  const isValid = isNonEmptyString(row.session_id)
    && startTime !== null
    && endTime !== null
    && endTime > startTime
    && isNonNegativeInteger(row.equipment_capacity)
    && isNonNegativeInteger(row.equipment_reserved)
    && isNonNegativeInteger(row.spots_remaining)
    && row.spots_remaining <= row.equipment_capacity
    && isNonNegativeInteger(row.academy_capacity)
    && isNonNegativeInteger(row.academy_bows_used)
    && isNonNegativeInteger(row.intro_bows_capacity)
    && row.intro_bows_capacity === 2
    && isNonNegativeInteger(row.intro_bows_used)
    && row.intro_bows_used <= row.intro_bows_capacity

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
    academyCapacity: row.academy_capacity as number,
    academyBowsUsed: row.academy_bows_used as number,
    introBowsCapacity: row.intro_bows_capacity as number,
    introBowsUsed: row.intro_bows_used as number,
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
    const context = 'No se pudo cargar la disponibilidad del fin de semana'
    throw new Error(error.message ? `${context}: ${error.message}` : `${context}.`)
  }

  if (data === null) return []
  if (!Array.isArray(data)) {
    throw new Error('La capacidad del fin de semana devolvió un formato inválido.')
  }

  return data.map(normalizeCapacityRow)
}
