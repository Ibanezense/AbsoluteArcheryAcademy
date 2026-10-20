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

/** Each call projects the complete current response. It never appends to an old version. */
export function projectCompetitionProgress(
  datasets: AcademyCompetitionSnapshot[]
): CompetitionParticipationView[] {
  const cards = new Map<string, CompetitionParticipationView>()
  for (const dataset of datasets) {
    const removed = (kind: string, id: string) =>
      dataset.tombstones.some(
        (row) => [kind, `${kind}s`].includes(row.entity_type) && row.entity_id === id
      )
    if (removed('competitor', dataset.competitor.competitor_id)) continue
    for (const participation of dataset.participations) {
      if (removed('participation', participation.participation_id)) continue
      const key = `${dataset.dataset_id}:${participation.participation_id}`
      if (cards.has(key)) continue
      const category = dataset.competitive_classes.find(
        (row) => row.competitive_class_id === participation.competitive_class_id
      )
      const rankings = dataset.ranking_entries.filter(
        (row) =>
          row.participation_id === participation.participation_id &&
          !removed('ranking_entry', row.ranking_entry_id)
      )
      const finals = dataset.final_results.filter(
        (row) =>
          row.participation_id === participation.participation_id &&
          !removed('final_result', row.final_result_id)
      )
      const qualifications = Array.from(
        new Map(
          dataset.qualifications
            .filter(
              (row) =>
                row.participation_id === participation.participation_id &&
                !removed('qualification', row.qualification_id)
            )
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
        participationStatus: participation.status,
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
              rankings.filter((entry) => entry.ranking_type === 'qualification')
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
  }
  return [...cards.values()].sort(
    (a, b) =>
      (b.eventStart || '').localeCompare(a.eventStart || '') || a.key.localeCompare(b.key)
  )
}
