import type { CompetitionParticipationView } from './studentCompetitionProgress'

export type CompetitionAward = {
  metal: 'gold' | 'silver' | 'bronze'
  place: 1 | 2 | 3
  label: string
}
export function getCompetitionAward(
  result: Pick<
    CompetitionParticipationView,
    'finalPosition' | 'finalStatuses' | 'participationStatus'
  >
): CompetitionAward | null {
  const { value, review } = result.finalPosition
  if (
    review ||
    result.participationStatus !== 'finished' ||
    result.finalStatuses.length !== 1 ||
    result.finalStatuses[0] !== 'official'
  )
    return null
  if (value === 1) return { metal: 'gold', place: 1, label: 'Medalla de oro' }
  if (value === 2) return { metal: 'silver', place: 2, label: 'Medalla de plata' }
  if (value === 3) return { metal: 'bronze', place: 3, label: 'Medalla de bronce' }
  return null
}
