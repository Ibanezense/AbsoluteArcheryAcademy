import { describe, expect, it } from 'vitest'
import { fragmentedCompetitionSnapshots, competitionSnapshot } from '@/tests/fixtures/studentCompetitions'
import { projectCompetitionProgress } from './studentCompetitionProgress'
import { getCompetitionAward } from './studentAchievement'

describe('complementary authorized tournament fragments', () => {
  it('combines registration, qualification and final into one complete card without changing source rows', () => {
    const source = fragmentedCompetitionSnapshots()
    const before = JSON.stringify(source)
    const cards = projectCompetitionProgress(source)
    expect(cards).toHaveLength(1)
    expect(cards[0].categoryLabel).toBe('Recurvo individual')
    expect(cards[0].qualifications).toMatchObject([{ score: 557, arrows: 72, distances: [40], position: { value: 2, review: false } }])
    expect(cards[0].finalPosition).toEqual({ value: 1, review: false })
    expect(getCompetitionAward(cards[0])?.metal).toBe('gold')
    expect(JSON.stringify(source)).toBe(before)
    expect(projectCompetitionProgress([...source].reverse())).toEqual(cards)
  })

  it.each(['dataset', 'version', 'tournament', 'student', 'name'] as const)('never combines matching display data across a different %s', (field) => {
    const [final, qualification] = fragmentedCompetitionSnapshots()
    if (field === 'dataset') qualification.dataset_id = 'another-dataset'
    if (field === 'version') qualification.dataset_version_id = 'another-version'
    if (field === 'tournament') {
      qualification.tournament.tournament_id = 'another-event'
      qualification.participations[0].tournament_id = 'another-event'
    }
    if (field === 'student') qualification.consumer_subject.external_id = 'another-student'
    if (field === 'name') qualification.competitor.display_name = 'Otra persona de prueba'
    expect(projectCompetitionProgress([final, qualification])).toHaveLength(2)
  })

  it('does not assign unknown-category stages when two documented categories are possible', () => {
    const source = fragmentedCompetitionSnapshots()
    const other = structuredClone(source[0])
    other.competitor.competitor_id = 'competitor-another-category'
    other.participations[0] = { ...other.participations[0], participation_id: 'participation-other', competitor_id: other.competitor.competitor_id, competitive_class_id: 'class-b' }
    other.competitive_classes = [{ ...other.competitive_classes[0], competitive_class_id: 'class-b', label: 'Compuesto individual', division: 'compound' }]
    other.final_results = []
    other.ranking_entries = []
    const cards = projectCompetitionProgress([...source, other])
    expect(cards.filter(c => c.categoryLabel !== 'Unknown').every(c => c.qualifications.length === 0)).toBe(true)
    expect(cards.filter(c => c.qualifications.some(q => q.score === 557))).toHaveLength(1)
    expect(cards.length).toBeGreaterThanOrEqual(3)
  })

  it('preserves legitimate separate participations for the same canonical competitor', () => {
    const first = competitionSnapshot()
    const second = structuredClone(first)
    second.participations[0].participation_id = 'legitimate-second-participation'
    second.qualifications[0].qualification_id = 'second-qualification'
    second.qualifications[0].participation_id = second.participations[0].participation_id
    expect(projectCompetitionProgress([first, second])).toHaveLength(2)
  })

  it.each([false, true])('does not greedily attach another stage when a canonical competitor has multiple participations (known category %s)', (known) => {
    const [final, qualification] = fragmentedCompetitionSnapshots()
    if (known) {
      qualification.competitive_classes = structuredClone(final.competitive_classes)
      qualification.participations[0].competitive_class_id = final.participations[0].competitive_class_id
    }
    const duplicate = structuredClone(qualification)
    duplicate.participations[0].participation_id = 'another-legitimate-participation'
    duplicate.qualifications[0] = { ...duplicate.qualifications[0], qualification_id: 'another-legitimate-score', participation_id: duplicate.participations[0].participation_id, score: 510 }
    const cards = projectCompetitionProgress([final, qualification, duplicate])
    expect(cards).toHaveLength(3)
    expect(cards.find(card => card.finalPosition.value === 1)?.qualifications).toEqual([])
    expect(projectCompetitionProgress([duplicate, qualification, final])).toEqual(cards)
  })

  it('retains conflicting positions for review instead of announcing a medal', () => {
    const source = fragmentedCompetitionSnapshots()
    source[1].final_results = [{ final_result_id: 'conflicting-final', participation_id: source[1].participations[0].participation_id, final_position: 2, result_status: 'official', source_kind: 'supplied' }]
    const cards = projectCompetitionProgress(source)
    expect(cards).toHaveLength(1)
    expect(cards[0].finalPosition).toEqual({ value: null, review: true })
    expect(getCompetitionAward(cards[0])).toBeNull()
  })

  it('keeps different qualification formats separate and does not sum or reuse a stage rank across them', () => {
    const source = fragmentedCompetitionSnapshots()
    source[1].qualifications.push({ ...source[1].qualifications[0], qualification_id: 'qualification-36', score: 280, arrow_count: 36 })
    const [card] = projectCompetitionProgress(source)
    expect(projectCompetitionProgress(source)).toHaveLength(1)
    expect(card.qualifications.map(q => q.score)).toEqual([557, 280])
    expect(card.qualifications.every(q => q.position.value === null)).toBe(true)
  })

  it('never restores a withdrawn fragment while merging its siblings', () => {
    const source = fragmentedCompetitionSnapshots()
    source[1].tombstones.push({ entity_type: 'qualification', entity_id: 'qualification-stage', replacement_entity_id: null, effective_dataset_version_id: source[1].dataset_version_id })
    const [card] = projectCompetitionProgress(source)
    expect(card.qualifications).toEqual([])
    expect(card.finalPosition.value).toBe(1)
  })
})
