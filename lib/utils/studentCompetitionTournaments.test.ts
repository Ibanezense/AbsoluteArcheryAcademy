import { describe, expect, it } from 'vitest'
import { competitionSnapshot, fragmentedCompetitionSnapshots, historicalTournament } from '@/tests/fixtures/studentCompetitions'
import { projectCompetitionTournaments } from './studentCompetitionProgress'

describe('one tournament container without guessing stage associations', () => {
  it('keeps 2025 qualification and both National/Open standings in one tournament', () => {
    const source = historicalTournament(), before = JSON.stringify(source)
    const events = projectCompetitionTournaments(source)
    expect(events).toHaveLength(1)
    expect(events[0].participations.flatMap(p => p.qualifications).map(q => q.score)).toEqual([544])
    expect(events[0].participations.filter(p => p.finalPosition.value !== null).map(p => [p.competitionScope, p.finalPosition.value]).sort()).toEqual([['national', 6], ['open', 4]])
    expect(JSON.stringify(source)).toBe(before)
    expect(projectCompetitionTournaments([...source].reverse())).toEqual(events)
  })
  it('preserves two legitimate categories and their scores within the tournament', () => {
    const first = competitionSnapshot(), second = structuredClone(first)
    second.participations[0].participation_id = 'second-participation'
    second.participations[0].competitive_class_id = 'compound-class'
    second.competitive_classes[0] = { ...second.competitive_classes[0], competitive_class_id: 'compound-class', label: 'Compuesto', division: 'compound' }
    second.qualifications[0] = { ...second.qualifications[0], qualification_id: 'compound-score', participation_id: 'second-participation', score: 650 }
    const [event] = projectCompetitionTournaments([first, second])
    expect(event.participations).toHaveLength(2)
    expect(event.participations.flatMap(p => p.qualifications).map(q => q.score).sort()).toEqual([493, 650])
  })
  it.each(['student', 'dataset', 'version', 'tournament', 'name'] as const)('does not mix a different %s even with the same title and date', field => {
    const [first, second] = fragmentedCompetitionSnapshots()
    if (field === 'student') second.consumer_subject.external_id = 'another-student'
    if (field === 'dataset') second.dataset_id = 'another-dataset'
    if (field === 'version') second.dataset_version_id = 'another-version'
    if (field === 'tournament') { second.tournament.tournament_id = 'another-event'; second.participations[0].tournament_id = 'another-event' }
    if (field === 'name') second.competitor.display_name = 'Otra persona de prueba'
    expect(projectCompetitionTournaments([first, second])).toHaveLength(2)
  })
})
