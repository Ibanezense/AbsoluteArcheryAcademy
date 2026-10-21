import type {
  AcademyCompetitionSnapshot,
  CompetitionsProgressResponse,
} from '@/lib/contracts/studentCompetitions'
import type { ProgressLink } from '@/lib/contracts/studentProgress'
import {
  engineHistory,
  engineAthleteMembers,
  engineDataset,
  EngineSourceError,
  type EngineHistory,
} from './engineClient'
export type EngineContext = { student_id: string; links: ProgressLink[] }
export type EngineReadResult = {
  anchor_competitor_id?: string
  authorized_competitor_ids?: string[]
  datasets: AcademyCompetitionSnapshot[]
  failures: number
  checked_at: string | null
}
type ReaderDependencies = {
  members?: (student: string, competitor: string, signal?: AbortSignal) => Promise<string[]>
  history: (
    student: string,
    competitor: string,
    after: string | null,
    signal?: AbortSignal
  ) => Promise<EngineHistory>
  dataset: (
    student: string,
    competitor: string,
    version: string,
    signal?: AbortSignal
  ) => Promise<AcademyCompetitionSnapshot>
}
const readerDependencies: ReaderDependencies = {
  members: engineAthleteMembers,
  history: engineHistory,
  dataset: engineDataset,
}
const oldest = (values: string[]) =>
  values.length
    ? values.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b))
    : null
export async function collectEngineCompetitions(
  studentId: string,
  competitorId: string,
  deps: ReaderDependencies = readerDependencies,
  signal?: AbortSignal
): Promise<EngineReadResult> {
  const members = deps.members ? await deps.members(studentId, competitorId, signal) : [competitorId]
  if (!members.length || members.length > 200 || !members.includes(competitorId) || new Set(members).size !== members.length) throw new EngineSourceError(502, 'invalid_source')
  const results: EngineReadResult[] = []
  for (let offset = 0; offset < members.length; offset += 4) {
    const batch = await Promise.all(members.slice(offset, offset + 4).map(id => collectIndividualCompetitions(studentId, id, deps, signal)))
    results.push(...batch)
  }
  return {
    anchor_competitor_id: competitorId, authorized_competitor_ids: members,
    datasets: results.flatMap(result => result.datasets),
    failures: results.reduce((count, result) => count + result.failures, 0),
    checked_at: oldest(results.map(result => result.checked_at).filter((value): value is string => !!value)),
  }
}
async function collectIndividualCompetitions(
  studentId: string,
  competitorId: string,
  deps: ReaderDependencies = readerDependencies,
  signal?: AbortSignal
): Promise<EngineReadResult> {
  async function collect(attempt: number): Promise<EngineReadResult> {
    let cursor: string | null = null,
      failures = 0,
      changed = false,
      finished = false
    const cursors = new Set<string>(),
      catalog = new Map<string, EngineHistory['datasets'][number]>(),
      timestamps: string[] = []
    for (let page = 0; page < 20; page++) {
      try {
        const history = await deps.history(
          studentId,
          competitorId,
          cursor,
          signal
        )
        timestamps.push(history.checked_at)
        for (const item of history.datasets) {
          const previous = catalog.get(item.dataset_id)
          if (
            previous &&
            previous.dataset_version_id !== item.dataset_version_id
          ) {
            changed = true
            continue
          }
          catalog.set(item.dataset_id, item)
        }
        if (history.next_cursor === null) {
          finished = true
          break
        }
        if (cursors.has(history.next_cursor)) {
          failures++
          break
        }
        cursors.add(history.next_cursor)
        cursor = history.next_cursor
      } catch {
        failures++
        break
      }
    }
    if (!finished && failures === 0) failures++
    if (changed) {
      if (attempt === 0) return collect(1)
      return { datasets: [], failures: failures + 1, checked_at: null }
    }
    const datasets: AcademyCompetitionSnapshot[] = []
    const entries = Array.from(catalog.values())
    for (let offset = 0; offset < entries.length; offset += 4) {
      await Promise.all(
        entries.slice(offset, offset + 4).map(async (item) => {
          try {
            const snapshot = await deps.dataset(
              studentId,
              competitorId,
              item.dataset_version_id,
              signal
            )
            if (
              snapshot.dataset_id !== item.dataset_id ||
              snapshot.dataset_version_id !== item.dataset_version_id ||
              snapshot.dataset_version !== item.dataset_version
            )
              throw new EngineSourceError(502, 'invalid_source')
            datasets.push(snapshot)
            timestamps.push(snapshot.checked_at)
          } catch (error) {
            failures++
            if (
              error instanceof EngineSourceError &&
              [404, 409].includes(error.status)
            )
              changed = true
          }
        })
      )
    }
    // Version replacement during the read refreshes the whole catalogue once. No mixed old rows.
    if (changed && attempt === 0) return collect(1)
    return {
      datasets: datasets.sort((a, b) =>
        a.dataset_id.localeCompare(b.dataset_id)
      ),
      failures,
      checked_at: timestamps.length ? oldest(timestamps) : null,
    }
  }
  return collect(0)
}
const cache = new Map<string, { expires: number; value: EngineReadResult }>()
const lastChecks = new Map<string, string>()
const keyOf = (link: ProgressLink) =>
  `te-academy-individual-progress-v1:${link.id}:${link.external_id}:${link.revision}`
const contextKey = (context: EngineContext) =>
  context.links.map(keyOf).sort().join('|')
export function clearCompetitionsCache() {
  cache.clear()
  lastChecks.clear()
}
export async function getCompetitionsProgress(
  studentId: string,
  deps: {
    context: () => Promise<EngineContext>
    read: (competitorId: string) => Promise<EngineReadResult>
  }
): Promise<CompetitionsProgressResponse> {
  let context = await deps.context()
  if (
    context.student_id !== studentId ||
    context.links.some(
      (l) =>
        l.student_id !== studentId ||
        l.source !== 'tournament_engine' ||
        l.status !== 'confirmed'
    )
  )
    throw Error('forbidden')
  const base = (
    state: CompetitionsProgressResponse['state']
  ): CompetitionsProgressResponse => ({
    state,
    student_id: studentId,
    checked_at: null,
    link_revisions: context.links.map((l) => ({
      id: l.id,
      revision: l.revision,
    })),
    datasets: [],
    failures: 0,
  })
  if (!context.links.length) return base('pending_link')
  const originalKey = contextKey(context)
  for (const [key, item] of cache)
    if (item.expires <= Date.now()) cache.delete(key)
  async function readAll(force: boolean) {
    const results: Array<{ link: ProgressLink; value: EngineReadResult }> = []
    const links = context.links.slice(0, 50)
    for (let offset = 0; offset < links.length; offset += 4)
      await Promise.all(
        links.slice(offset, offset + 4).map(async (link) => {
          const key = keyOf(link)
          try {
            let value = !force ? cache.get(key)?.value : undefined
            if (!value) {
              value = await deps.read(link.external_id)
              const permittedIds = value.anchor_competitor_id === link.external_id && value.authorized_competitor_ids?.includes(link.external_id)
                ? value.authorized_competitor_ids : [link.external_id]
              if (
                value.datasets.some(
                  (d) =>
                    d.consumer_subject.external_id !== studentId ||
                    !permittedIds.includes(d.competitor.competitor_id)
                )
              )
                throw Error('invalid_source')
              if (value.failures === 0) {
                if (cache.size >= 100) cache.delete(cache.keys().next().value!)
                cache.set(key, { expires: Date.now() + 300000, value })
                if (value.checked_at) {
                  if (lastChecks.size >= 100 && !lastChecks.has(key))
                    lastChecks.delete(lastChecks.keys().next().value!)
                  lastChecks.set(key, value.checked_at)
                }
              }
            }
            results.push({ link, value })
          } catch {
            results.push({
              link,
              value: {
                datasets: [],
                failures: 1,
                checked_at: lastChecks.get(key) ?? null,
              },
            })
          }
        })
      )
    return results
  }
  let results = await readAll(false)
  const conflicting = (rows: typeof results) => {
    const versions = new Map<string, string>(),
      conflicts = new Set<string>()
    for (const { value } of rows)
      for (const d of value.datasets) {
        const prior = versions.get(d.dataset_id)
        if (prior && prior !== d.dataset_version_id) conflicts.add(d.dataset_id)
        versions.set(d.dataset_id, d.dataset_version_id)
      }
    return conflicts
  }
  if (conflicting(results).size) {
    for (const link of context.links) cache.delete(keyOf(link))
    results = await readAll(true)
  }
  const conflicts = conflicting(results)
  // Actor and complete local confirmed-link set are authoritative even on a hot cache.
  context = await deps.context()
  if (context.student_id !== studentId) throw Error('forbidden')
  if (contextKey(context) !== originalKey) {
    for (const { link } of results) {
      cache.delete(keyOf(link))
      lastChecks.delete(keyOf(link))
    }
    return base('pending_link')
  }
  const seen = new Set<string>(),
    datasets: AcademyCompetitionSnapshot[] = []
  for (const { value } of results)
    for (const snapshot of value.datasets) {
      if (conflicts.has(snapshot.dataset_id)) continue
      const identity = `${snapshot.dataset_id}:${snapshot.competitor.competitor_id}`
      if (!seen.has(identity)) {
        seen.add(identity)
        datasets.push(snapshot)
      }
    }
  const failures =
    results.reduce((total, r) => total + r.value.failures, 0) +
    conflicts.size +
    Math.max(0, context.links.length - 50)
  const verified = results.some(
    (r) => r.value.failures === 0 || r.value.datasets.length > 0
  )
  const state = failures
    ? verified
      ? 'partial'
      : 'unavailable'
    : datasets.some((d) => d.participations.length > 0)
      ? 'ready'
      : 'empty'
  return {
    ...base(state),
    datasets,
    failures,
    checked_at: oldest(
      results.map((r) => r.value.checked_at).filter((v): v is string => !!v)
    ),
  }
}
