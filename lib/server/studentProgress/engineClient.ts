import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import datasetSchema from '@/lib/contracts/academy-individual-progress-v1.schema.json'
import historySchema from '@/lib/contracts/academy-individual-progress-history-v1.schema.json'
import identitySchema from '@/lib/contracts/academy-identity-v1.schema.json'
import commandSchema from '@/lib/contracts/academy-identity-command-v1.schema.json'
import type {
  AcademyCompetitionSnapshot,
  EngineCandidate,
  EngineIdentityPreview,
} from '@/lib/contracts/studentCompetitions'
const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  allErrors: false,
})
addFormats(ajv)
export function engineTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(
      value
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return false
  return (
    new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) ===
    value.slice(0, 10)
  )
}
ajv.addFormat('date-time', { type: 'string', validate: engineTimestamp })
const validateDataset = ajv.compile(datasetSchema),
  validateHistory = ajv.compile(historySchema),
  validateIdentity = ajv.compile(identitySchema),
  validateCommand = ajv.compile(commandSchema)
export const engineIdPattern = /^[A-Za-z0-9_-]{1,160}$/
export class EngineSourceError extends Error {
  constructor(
    public status: number,
    public code: 'remote_unavailable' | 'identity_conflict' | 'invalid_source'
  ) {
    super(code)
  }
}
function invalid(): never {
  throw new EngineSourceError(502, 'invalid_source')
}
function unique<T>(rows: T[], getId: (row: T) => string) {
  const ids = new Set<string>()
  for (const row of rows) {
    const id = getId(row)
    if (ids.has(id)) invalid()
    ids.add(id)
  }
  return ids
}
export function validateEngineSnapshot(
  value: unknown,
  studentId: string,
  competitorId: string
): AcademyCompetitionSnapshot {
  if (!validateDataset(value)) invalid()
  const row = value as AcademyCompetitionSnapshot
  if (
    row.consumer_subject.external_id !== studentId ||
    row.competitor.competitor_id !== competitorId
  )
    invalid()
  for (const list of [
    row.participations,
    row.qualifications,
    row.final_results,
    row.ranking_entries,
    row.tombstones,
  ])
    if (list.length > 10_000) invalid()
  const classes = unique(row.competitive_classes, (r) => r.competitive_class_id)
  const participants = unique(row.participations, (r) => r.participation_id)
  unique(row.qualifications, (r) => r.qualification_id)
  unique(row.final_results, (r) => r.final_result_id)
  unique(row.ranking_entries, (r) => r.ranking_entry_id)
  const segments = new Set<string>()
  for (const p of row.participations)
    if (
      p.competitor_id !== competitorId ||
      p.tournament_id !== row.tournament.tournament_id ||
      !classes.has(p.competitive_class_id)
    )
      invalid()
  for (const q of row.qualifications) {
    if (!participants.has(q.participation_id) || q.segments.length > 1000) invalid()
    for (const s of q.segments) {
      if (segments.has(s.qualification_segment_id)) invalid()
      segments.add(s.qualification_segment_id)
    }
  }
  for (const result of [...row.final_results, ...row.ranking_entries])
    if (!participants.has(result.participation_id)) invalid()
  return row
}
export type EngineHistory = {
  contract_version: 'te-academy-individual-progress-history-v1'
  complete: true
  checked_at: string
  datasets: Array<{
    dataset_id: string
    dataset_version_id: string
    dataset_version: number
    published_at: string
    name: string
    start_date: string
  }>
  next_cursor: string | null
}
export function validateEngineHistory(value: unknown): EngineHistory {
  if (!validateHistory(value)) invalid()
  return value as EngineHistory
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function keys(row: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(row).sort().join() !== [...allowed].sort().join()) invalid()
}
function candidate(value: unknown): EngineCandidate {
  const c = object(value)
  keys(c, ['competitor_id', 'display_name', 'identity_status'])
  if (
    typeof c.competitor_id !== 'string' ||
    !engineIdPattern.test(c.competitor_id) ||
    typeof c.display_name !== 'string' ||
    !c.display_name.trim() ||
    c.display_name.length > 500 ||
    typeof c.identity_status !== 'string' ||
    c.identity_status.length > 100
  )
    invalid()
  return c as EngineCandidate
}
export function validateEngineSearch(value: unknown) {
  if (!validateIdentity(value)) invalid()
  const row = object(value)
  keys(row, ['contract_version', 'checked_at', 'candidates', 'has_more'])
  if (
    row.contract_version !== 'te-academy-identity-v1' ||
    !engineTimestamp(row.checked_at) ||
    !Array.isArray(row.candidates) ||
    row.candidates.length > 20 ||
    typeof row.has_more !== 'boolean'
  )
    invalid()
  const candidates = row.candidates.map(candidate)
  unique(candidates, (c) => c.competitor_id)
  return { candidates, has_more: row.has_more }
}
export function validateEnginePreview(
  value: unknown,
  competitorId: string
): EngineIdentityPreview {
  if (!validateIdentity(value)) invalid()
  const row = object(value)
  keys(row, [
    'contract_version',
    'checked_at',
    'candidate',
    'published_individual_datasets',
    'recent_events',
  ])
  const c = candidate(row.candidate)
  if (
    row.contract_version !== 'te-academy-identity-v1' ||
    !engineTimestamp(row.checked_at) ||
    c.competitor_id !== competitorId ||
    !Number.isInteger(row.published_individual_datasets) ||
    Number(row.published_individual_datasets) < 0 ||
    !Array.isArray(row.recent_events) ||
    row.recent_events.length > 5
  )
    invalid()
  for (const event of row.recent_events) {
    const e = object(event)
    keys(e, ['name', 'start_date', 'category_labels'])
    if (
      typeof e.name !== 'string' ||
      e.name.length > 500 ||
      !(
        e.start_date === null ||
        (typeof e.start_date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(e.start_date) &&
          new Date(e.start_date + 'T00:00:00Z').toISOString().slice(0, 10) === e.start_date)
      ) ||
      !Array.isArray(e.category_labels) ||
      e.category_labels.length > 100 ||
      e.category_labels.some((v) => typeof v !== 'string' || v.length > 500)
    )
      invalid()
  }
  return {
    candidate: c,
    published_individual_datasets: Number(row.published_individual_datasets),
    recent_events: row.recent_events as EngineIdentityPreview['recent_events'],
  }
}
export type EngineIdentityStatus = {
  contract_version: 'te-academy-identity-v1'
  checked_at: string
  namespace: 'academy_reservas_student'
  competitor_id: string
  external_id: string
  generation: number | null
  link_status: 'confirmed' | 'revoked' | 'absent'
  verified_at: string | null
  request: null | {
    request_id: string
    action: 'confirm' | 'revoke'
    generation: number
    status: 'applied'
    applied_at: string
  }
}
export function validateEngineIdentityStatus(
  value: unknown,
  studentId: string,
  competitorId: string
): EngineIdentityStatus {
  if (!validateIdentity(value)) invalid()
  const row = object(value)
  keys(row, [
    'contract_version',
    'checked_at',
    'namespace',
    'competitor_id',
    'external_id',
    'generation',
    'link_status',
    'verified_at',
    'request',
  ])
  if (
    row.contract_version !== 'te-academy-identity-v1' ||
    !engineTimestamp(row.checked_at) ||
    row.namespace !== 'academy_reservas_student' ||
    row.external_id !== studentId ||
    row.competitor_id !== competitorId ||
    !['confirmed', 'revoked', 'absent'].includes(String(row.link_status)) ||
    !(
      row.generation === null ||
      (Number.isInteger(row.generation) && Number(row.generation) > 0)
    ) ||
    !(row.verified_at === null || engineTimestamp(row.verified_at))
  )
    invalid()
  if (row.link_status === 'confirmed' && (row.verified_at === null || row.generation === null))
    invalid()
  if (row.request !== null) {
    const receipt = object(row.request)
    keys(receipt, ['request_id', 'action', 'generation', 'status', 'applied_at'])
    if (
      typeof receipt.request_id !== 'string' ||
      !['confirm', 'revoke'].includes(String(receipt.action)) ||
      !Number.isInteger(receipt.generation) ||
      Number(receipt.generation) < 1 ||
      receipt.status !== 'applied' ||
      !engineTimestamp(receipt.applied_at)
    )
      invalid()
  }
  return row as EngineIdentityStatus
}
async function requestEngine(
  path: string,
  parameters: Record<string, string>,
  kind: 'reader' | 'identity',
  body?: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const base = process.env.TOURNAMENT_ENGINE_URL
  const token =
    process.env[
      kind === 'reader'
        ? 'TOURNAMENT_ENGINE_ACADEMY_TOKEN'
        : 'TOURNAMENT_ENGINE_ACADEMY_IDENTITY_TOKEN'
    ]
  const other =
    process.env[
      kind === 'reader'
        ? 'TOURNAMENT_ENGINE_ACADEMY_IDENTITY_TOKEN'
        : 'TOURNAMENT_ENGINE_ACADEMY_TOKEN'
    ]
  if (
    !base ||
    !token ||
    token.length < 32 ||
    token.trim() !== token ||
    (other && other === token)
  )
    throw new EngineSourceError(503, 'remote_unavailable')
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
    throw new EngineSourceError(503, 'remote_unavailable')
  url.pathname = path
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  let response: Response
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      redirect: 'error',
      signal: signal
        ? (
            AbortSignal as typeof AbortSignal & {
              any: (signals: AbortSignal[]) => AbortSignal
            }
          ).any([signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
    })
  } catch {
    throw new EngineSourceError(503, 'remote_unavailable')
  }
  if (!response.ok)
    throw new EngineSourceError(
      response.status,
      response.status === 409
        ? 'identity_conflict'
        : response.status >= 500
          ? 'remote_unavailable'
          : 'invalid_source'
    )
  if (!response.body) invalid()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 8_000_000) invalid()
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof EngineSourceError) throw error
    throw new EngineSourceError(503, 'remote_unavailable')
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    invalid()
  }
}
export async function engineSearch(query: string, studentId?: string) {
  return validateEngineSearch(
    await requestEngine(
      '/api/v1/academy-identity',
      { operation: 'search', q: query, ...(studentId ? { external_id: studentId } : {}) },
      'identity'
    )
  )
}
export async function enginePreview(competitorId: string) {
  return validateEnginePreview(
    await requestEngine(
      '/api/v1/academy-identity',
      { operation: 'preview', competitor_id: competitorId },
      'identity'
    ),
    competitorId
  )
}
export async function engineStatus(
  studentId: string,
  competitorId: string,
  requestId: string
) {
  return validateEngineIdentityStatus(
    await requestEngine(
      '/api/v1/academy-identity',
      {
        operation: 'status',
        competitor_id: competitorId,
        external_id: studentId,
        request_id: requestId,
      },
      'identity'
    ),
    studentId,
    competitorId
  )
}
export async function engineCommand(body: {
  operation: 'confirm' | 'revoke'
  request_id: string
  competitor_id: string
  external_id: string
  actor_id: string
  evidence: string
  generation: number
}) {
  if (!validateCommand(body)) invalid()
  return validateEngineIdentityStatus(
    await requestEngine('/api/v1/academy-identity', {}, 'identity', body),
    body.external_id,
    body.competitor_id
  )
}
export async function engineHistory(
  studentId: string,
  competitorId: string,
  after: string | null,
  signal?: AbortSignal
) {
  return validateEngineHistory(
    await requestEngine(
      '/api/v1/consumer',
      {
        consumer: 'academy',
        operation: 'history',
        competitor_id: competitorId,
        external_id: studentId,
        ...(after ? { after } : {}),
      },
      'reader',
      undefined,
      signal
    )
  )
}
export async function engineAthleteMembers(studentId: string, competitorId: string, signal?: AbortSignal): Promise<string[]> {
  const row = object(await requestEngine('/api/v1/consumer', {
    consumer: 'academy', operation: 'members', competitor_id: competitorId, external_id: studentId,
  }, 'reader', undefined, signal))
  keys(row, ['contract_version', 'checked_at', 'external_id', 'anchor_competitor_id', 'competitor_ids'])
  if (row.contract_version !== 'te-academy-athlete-members-v1' || row.external_id !== studentId || row.anchor_competitor_id !== competitorId || !engineTimestamp(row.checked_at)
    || !Array.isArray(row.competitor_ids) || row.competitor_ids.length < 1 || row.competitor_ids.length > 200
    || !row.competitor_ids.every(id => typeof id === 'string' && engineIdPattern.test(id))
    || !row.competitor_ids.includes(competitorId) || new Set(row.competitor_ids).size !== row.competitor_ids.length) invalid()
  return row.competitor_ids as string[]
}
export async function engineDataset(
  studentId: string,
  competitorId: string,
  versionId: string,
  signal?: AbortSignal
) {
  const envelope = object(
    await requestEngine(
      '/api/v1/consumer',
      {
        consumer: 'academy',
        operation: 'dataset',
        competitor_id: competitorId,
        external_id: studentId,
        dataset_version_id: versionId,
        class_context: 'scope-v1',
      },
      'reader',
      undefined,
      signal
    )
  )
  keys(envelope, ['dataset_version', 'payload'])
  if (!Number.isInteger(envelope.dataset_version) || Number(envelope.dataset_version) < 1)
    invalid()
  const row = validateEngineSnapshot(envelope.payload, studentId, competitorId)
  if (row.dataset_version_id !== versionId || row.dataset_version !== envelope.dataset_version)
    invalid()
  return row
}
