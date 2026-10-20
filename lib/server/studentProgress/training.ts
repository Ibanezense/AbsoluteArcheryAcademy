import type {
  AcademyControlsSnapshot,
  ProgressLink,
  TrainingProgressResponse,
} from '@/lib/contracts/studentProgress'
import { summarizeTrainingControls } from '@/lib/utils/studentTrainingProgress'
export type ProgressContext = {
  student_id: string
  assigned_distance_m: number | null
  link: ProgressLink | null
}
type Dependencies = {
  context: () => Promise<ProgressContext>
  read: (externalId: string) => Promise<AcademyControlsSnapshot>
}
const cache = new Map<string, { expires: number; snapshot: AcademyControlsSnapshot }>()
const lastChecks = new Map<string, string>()
export function clearTrainingCache() {
  cache.clear()
  lastChecks.clear()
}
export function invalidateTrainingCache() {
  clearTrainingCache()
}
function linkKey(link: ProgressLink) {
  return `academy-student-controls-v1:${link.id}:${link.external_id}:${link.revision}`
}
export async function getTrainingProgress(
  studentId: string,
  deps: Dependencies
): Promise<TrainingProgressResponse> {
  let context = await deps.context()
  if (context.student_id !== studentId) throw Error('forbidden')
  const base = (state: TrainingProgressResponse['state']): TrainingProgressResponse => ({
    state,
    student_id: studentId,
    assigned_distance_m: context.assigned_distance_m,
    assignment_checked_at: new Date().toISOString(),
    link_revision: context.link?.revision ?? null,
    checked_at: null,
    controls: [],
    summary: null,
  })
  if (!context.link || context.link.status !== 'confirmed') return base('pending_link')
  const key = linkKey(context.link)
  let snapshot: AcademyControlsSnapshot | null = null
  // Expired snapshots are removed rather than retained as stale sporting data.
  for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey)
  try {
    const cached = cache.get(key)
    snapshot = cached ? cached.snapshot : await deps.read(context.link.external_id)
    if (!cached) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!)
      if (lastChecks.size >= 100 && !lastChecks.has(key))
        lastChecks.delete(lastChecks.keys().next().value!)
      cache.set(key, { expires: Date.now() + 300_000, snapshot })
      lastChecks.set(key, snapshot.checked_at)
    }
  } catch {
    snapshot = null
  }
  // Recheck relationship, active actor, link revision and distance after source failures too.
  context = await deps.context()
  if (context.student_id !== studentId) throw Error('forbidden')
  if (!context.link || context.link.status !== 'confirmed' || linkKey(context.link) !== key) {
    cache.delete(key)
    lastChecks.delete(key)
    return base('pending_link')
  }
  if (!snapshot) return { ...base('unavailable'), checked_at: lastChecks.get(key) ?? null }
  if (snapshot.student.id !== context.link.external_id) {
    cache.delete(key)
    lastChecks.delete(key)
    return base('unavailable')
  }
  return {
    ...base(snapshot.controls.length ? 'ready' : 'empty'),
    checked_at: snapshot.checked_at,
    controls: snapshot.controls,
    summary: summarizeTrainingControls(snapshot.controls, context.assigned_distance_m),
  }
}
