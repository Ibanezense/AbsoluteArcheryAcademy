import type { AcademyCompetitionSnapshot } from '@/lib/contracts/studentCompetitions'

export type CompetitionPosition = { value: number | null; review: boolean }
export type CompetitionParticipationView = {
  key: string
  participationId: string
  datasetId: string
  datasetVersion: number
  eventName: string
  eventStart: string | null
  eventEnd: string | null
  categoryLabel: string
  participationStatus: string
  qualifications: Array<{
    id: string
    score: number | null
    arrows: number | null
    distances: number[]
    position: CompetitionPosition
  }>
  finalPosition: CompetitionPosition
  finalStatuses: string[]
  sourceParticipationIds?: string[]
}

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
function position(
  direct: Array<number | null>,
  ranking: Array<{ ranking_entry_id: string; position: number | null }>
): CompetitionPosition {
  const explicit = Array.from(
    new Map(ranking.map((row) => [row.ranking_entry_id, row])).values()
  )
  const ranks = Array.from(
    new Set([...direct, ...explicit.map((row) => row.position)].filter(positive))
  )
  const ambiguousFallback =
    !direct.some(positive) && explicit.filter((row) => positive(row.position)).length > 1
  return {
    value: ranks.length === 1 && !ambiguousFallback ? ranks[0] : null,
    review: ranks.length > 1 || ambiguousFallback,
  }
}

type Fragment = {
  dataset: AcademyCompetitionSnapshot
  participation: AcademyCompetitionSnapshot['participations'][number]
  category: AcademyCompetitionSnapshot['competitive_classes'][number] | undefined
  qualifications: AcademyCompetitionSnapshot['qualifications']
  finals: AcademyCompetitionSnapshot['final_results']
  rankings: AcademyCompetitionSnapshot['ranking_entries']
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function documentedCategory(fragment: Fragment) {
  return [fragment.category?.label, fragment.category?.division, fragment.category?.age_class, fragment.category?.gender]
    .some(value => !!value && !['unknown', 'unspecified', 'not documented', 'categoria no documentada'].includes(normalize(value)))
}

/** Combine stage IDs only within the same authorized athlete, source version and tournament. */
function competitionGroups(datasets: AcademyCompetitionSnapshot[]): Fragment[][] {
  const scopes = new Map<string, Fragment[]>()
  const seen = new Set<string>()
  for (const dataset of datasets) {
    const removed = (kind: string, id: string) => dataset.tombstones.some(row => [kind, `${kind}s`].includes(row.entity_type) && row.entity_id === id)
    if (removed('competitor', dataset.competitor.competitor_id)) continue
    const words = normalize(dataset.competitor.display_name).split(' ').filter(Boolean)
    const athlete = words.length >= 2 ? words.sort().join(' ') : dataset.competitor.competitor_id
    for (const participation of dataset.participations) {
      const identity = JSON.stringify([dataset.dataset_id, dataset.dataset_version_id, participation.participation_id])
      if (seen.has(identity) || removed('participation', participation.participation_id)) continue
      seen.add(identity)
      const scope = JSON.stringify([dataset.consumer_subject.namespace, dataset.consumer_subject.external_id, dataset.dataset_id, dataset.dataset_version_id, dataset.dataset_version, dataset.tournament.tournament_id, participation.tournament_id, athlete])
      const fragment: Fragment = {
        dataset, participation,
        category: dataset.competitive_classes.find(row => row.competitive_class_id === participation.competitive_class_id),
        qualifications: dataset.qualifications.filter(row => row.participation_id === participation.participation_id && !removed('qualification', row.qualification_id)),
        finals: dataset.final_results.filter(row => row.participation_id === participation.participation_id && !removed('final_result', row.final_result_id)),
        rankings: dataset.ranking_entries.filter(row => row.participation_id === participation.participation_id && !removed('ranking_entry', row.ranking_entry_id)),
      }
      const entries = scopes.get(scope) || []
      entries.push(fragment)
      scopes.set(scope, entries)
    }
  }
  const groups: Fragment[][] = []
  for (const entries of scopes.values()) {
    entries.sort((a, b) => a.participation.participation_id.localeCompare(b.participation.participation_id))
    // Multiple participations of an already canonical competitor establish a
    // real ambiguity. Do not choose a stage association by iteration/ID order.
    if (new Set(entries.map(row => row.participation.competitor_id)).size !== entries.length) {
      groups.push(...entries.map(row => [row]))
      continue
    }
    const known: Fragment[][] = [], unknown: Fragment[][] = []
    const differentCompetitor = (group: Fragment[], entry: Fragment) => !group.some(row => row.participation.competitor_id === entry.participation.competitor_id)
    const place = (buckets: Fragment[][], entry: Fragment) => {
      const target = buckets.find(group => group[0].participation.competitive_class_id === entry.participation.competitive_class_id && differentCompetitor(group, entry))
      if (target) target.push(entry)
      else buckets.push([entry])
    }
    for (const entry of entries.filter(documentedCategory)) place(known, entry)
    for (const entry of entries.filter(row => !documentedCategory(row))) {
      // Unknown-category stages cannot be assigned when two legitimate categories
      // (or two participations of one canonical competitor) could be the target.
      if (known.length === 1 && differentCompetitor(known[0], entry)) known[0].push(entry)
      else place(unknown, entry)
    }
    groups.push(...known, ...unknown)
  }
  return groups
}

function participationStatus(group: Fragment[]) {
  const values = Array.from(new Set(group.map(row => row.participation.status).filter(value => value !== 'unknown')))
  if (values.length === 1) return values[0]
  const stages = ['entered', 'started', 'finished']
  return values.length && values.every(value => stages.includes(value))
    ? stages[Math.max(...values.map(value => stages.indexOf(value)))]
    : 'unknown'
}

/** Each call projects the complete current response. It never appends to an old version or edits source rows. */
export function projectCompetitionProgress(
  datasets: AcademyCompetitionSnapshot[]
): CompetitionParticipationView[] {
  const cards = new Map<string, CompetitionParticipationView>()
  for (const group of competitionGroups(datasets)) {
      const { dataset, participation, category } = group[0]
      const key = `${dataset.dataset_id}:${participation.participation_id}`
      const rankings = group.flatMap(row => row.rankings)
      const finals = group.flatMap(row => row.finals)
      const qualifications = Array.from(
        new Map(
          group.flatMap(row => row.qualifications)
            .map((row) => [row.qualification_id, row])
        ).values()
      )
      cards.set(key, {
        key,
        participationId: participation.participation_id,
        datasetId: dataset.dataset_id,
        datasetVersion: dataset.dataset_version,
        eventName: dataset.tournament.name,
        eventStart: dataset.tournament.start_date,
        eventEnd: dataset.tournament.end_date,
        categoryLabel: category?.label || 'Categoría no documentada',
        participationStatus: participationStatus(group),
        sourceParticipationIds: group.map(row => row.participation.participation_id).sort(),
        qualifications: qualifications.map((row) => {
          const segmentDistances = [...row.segments]
            .sort((a, b) => a.segment_order - b.segment_order)
            .map((segment) => segment.distance_m)
            .filter(positive)
          return {
            id: row.qualification_id,
            score: row.score,
            arrows: positive(row.arrow_count) ? row.arrow_count : null,
            distances: Array.from(
              new Set(
                segmentDistances.length
                  ? segmentDistances
                  : positive(row.distance_m)
                    ? [row.distance_m]
                    : []
              )
            ),
            position: position(
              [row.rank],
              rankings.filter((entry) => entry.ranking_type === 'qualification' && (qualifications.length === 1 || entry.participation_id === row.participation_id))
            ),
          }
        }),
        finalPosition: position(
          finals.map((row) => row.final_position),
          rankings.filter((row) => row.ranking_type === 'final')
        ),
        finalStatuses: Array.from(new Set(finals.map((row) => row.result_status))),
      })
  }
  return [...cards.values()].sort(
    (a, b) =>
      (b.eventStart || '').localeCompare(a.eventStart || '') || a.key.localeCompare(b.key)
  )
}
