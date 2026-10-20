import {
  ACADEMY_CONTROLS_CONTRACT,
  ACADEMY_DIRECTORY_CONTRACT,
  type AcademyControlsSnapshot,
  type AcademyIdentity,
} from '@/lib/contracts/studentProgress'
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const distances = new Set([10, 15, 20, 30, 40, 50, 60, 70, 18, 25])
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_contract')
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).sort().join() !== [...expected].sort().join())
    throw Error('invalid_contract')
}
function iso(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(
      value
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return false
  const civil = value.slice(0, 10)
  return new Date(civil + 'T00:00:00Z').toISOString().slice(0, 10) === civil
}
function identity(value: unknown): AcademyIdentity {
  const row = object(value)
  keys(row, ['id', 'name', 'active'])
  if (
    typeof row.id !== 'string' ||
    !uuidPattern.test(row.id) ||
    typeof row.name !== 'string' ||
    !row.name.trim() ||
    row.name.length > 100 ||
    ![0, 1].includes(row.active as number)
  )
    throw Error('invalid_contract')
  return row as AcademyIdentity
}
export function validateControlsSnapshot(
  value: unknown,
  externalId: string
): AcademyControlsSnapshot {
  const row = object(value)
  keys(row, ['contract_version', 'complete', 'checked_at', 'student', 'controls'])
  const student = identity(row.student)
  if (
    row.contract_version !== ACADEMY_CONTROLS_CONTRACT ||
    row.complete !== true ||
    !iso(row.checked_at) ||
    student.id !== externalId ||
    !Array.isArray(row.controls) ||
    row.controls.length > 5000
  )
    throw Error('invalid_contract')
  const ids = new Set<string>()
  const now = new Date()
  const limaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const limaTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
  for (const value of row.controls) {
    const c = object(value)
    keys(c, [
      'id',
      'student_id',
      'distance',
      'arrows',
      'score',
      'performed_date',
      'performed_time',
      'status',
      'revision',
      'created_at',
      'updated_at',
    ])
    if (
      typeof c.id !== 'string' ||
      !uuidPattern.test(c.id) ||
      ids.has(c.id) ||
      c.student_id !== externalId ||
      !distances.has(c.distance as number) ||
      ![36, 72].includes(c.arrows as number) ||
      !Number.isInteger(c.score) ||
      (c.score as number) < 0 ||
      (c.score as number) > (c.arrows as number) * 10 ||
      !['valid', 'annulled'].includes(c.status as string) ||
      !Number.isInteger(c.revision) ||
      (c.revision as number) < 1 ||
      !iso(c.created_at) ||
      !iso(c.updated_at)
    )
      throw Error('invalid_contract')
    if (
      typeof c.performed_date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(c.performed_date) ||
      new Date(c.performed_date + 'T00:00:00Z').toISOString().slice(0, 10) !== c.performed_date ||
      c.performed_date > limaDate
    )
      throw Error('invalid_contract')
    if (
      c.performed_time !== null &&
      (typeof c.performed_time !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.performed_time) ||
        (c.performed_date === limaDate && c.performed_time > limaTime))
    )
      throw Error('invalid_contract')
    ids.add(c.id)
  }
  return row as unknown as AcademyControlsSnapshot
}
export function validateDirectory(value: unknown) {
  const row = object(value)
  keys(row, ['contract_version', 'checked_at', 'candidates', 'has_more'])
  if (
    row.contract_version !== ACADEMY_DIRECTORY_CONTRACT ||
    !iso(row.checked_at) ||
    !Array.isArray(row.candidates) ||
    row.candidates.length > 20 ||
    typeof row.has_more !== 'boolean'
  )
    throw Error('invalid_contract')
  const candidates = row.candidates.map(identity)
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length)
    throw Error('invalid_contract')
  return { candidates, has_more: row.has_more }
}
async function requestSource(param: string, value: string): Promise<unknown> {
  const base = process.env.ACADEMY_CONTROLS_URL
  const token = process.env.ACADEMY_CONTROLS_READ_TOKEN
  if (!base || !token || token.trim() !== token || token.length < 32)
    throw Error('source_unavailable')
  const url = new URL(base)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (process.env.NODE_ENV === 'development' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw Error('source_unavailable')
  url.pathname = '/api/integrations/student-controls'
  url.searchParams.set(param, value)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok || !response.body) throw Error('source_unavailable')
  const reader = response.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4_000_000) throw Error('source_too_large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
export async function readControls(externalId: string) {
  return validateControlsSnapshot(await requestSource('student_id', externalId), externalId)
}
export async function searchControls(query: string) {
  return validateDirectory(await requestSource('q', query))
}
