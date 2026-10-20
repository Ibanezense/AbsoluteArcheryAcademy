import { describe, expect, it } from 'vitest'
import {
  competitionQualification as qualification,
  competitionSnapshot as snapshot,
} from '@/tests/fixtures/studentCompetitions'
import { projectCompetitionProgress } from './studentCompetitionProgress'

describe('individual competition projection', () => {
  it('removes a withdrawn competitor even when relational rows remain in the snapshot', () => {
    expect(
      projectCompetitionProgress([
        snapshot({
          tombstones: [
            {
              entity_type: 'competitor',
              entity_id: 'competitor-a',
              replacement_entity_id: null,
              effective_dataset_version_id: 'version-a-1',
            },
          ],
        }),
      ])
    ).toEqual([])
  })
  it('keeps qualification score and rank separate from the final position and its status', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        ranking_entries: [
          {
            ranking_entry_id: 'ranking-a',
            participation_id: 'participation-a',
            ranking_type: 'qualification',
            position: 7,
            source_kind: 'supplied',
          },
        ],
        final_results: [
          {
            final_result_id: 'final-a',
            participation_id: 'participation-a',
            final_position: 3,
            result_status: 'official',
            source_kind: 'supplied',
          },
        ],
      }),
    ])
    expect(card.qualifications[0].score).toBe(493)
    expect(card.qualifications[0].position).toEqual({
      value: 7,
      review: false,
    })
    expect(card.finalPosition).toEqual({ value: 3, review: false })
    expect(card.finalStatuses).toEqual(['official'])
  })
  it('flags conflicting direct and explicit qualification ranks', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        qualifications: [qualification({ rank: 2 })],
        ranking_entries: [
          {
            ranking_entry_id: 'r',
            participation_id: 'participation-a',
            ranking_type: 'qualification',
            position: 3,
            source_kind: 'supplied',
          },
        ],
      }),
    ])
    expect(card.qualifications[0].position).toEqual({
      value: null,
      review: true,
    })
  })
  it('does not invent a rank from score or unrelated ranking types', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        ranking_entries: [
          {
            ranking_entry_id: 'r',
            participation_id: 'participation-a',
            ranking_type: 'source_other',
            position: 1,
            source_kind: 'supplied',
          },
        ],
      }),
    ])
    expect(card.qualifications[0].position).toEqual({
      value: null,
      review: false,
    })
    expect(card.finalPosition.value).toBeNull()
  })
  it('retains each qualification separately without summing different formats', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        qualifications: [
          qualification(),
          qualification({
            qualification_id: 'q2',
            score: 280,
            arrow_count: 36,
          }),
        ],
      }),
    ])
    expect(card.qualifications.map((row) => row.score)).toEqual([493, 280])
    expect(card.qualifications.map((row) => row.arrows)).toEqual([72, 36])
  })
  it('preserves documented distances and does not infer arrows from score zero', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        qualifications: [
          qualification({
            score: 0,
            arrow_count: 0,
            distance_m: undefined,
            data_level: undefined,
          }),
        ],
      }),
    ])
    expect(card.qualifications[0]).toMatchObject({
      score: 0,
      arrows: null,
      distances: [],
    })
  })
  it('uses direct total-only distance and ordered segment distances without averaging', () => {
    const [direct] = projectCompetitionProgress([snapshot()])
    expect(direct.qualifications[0].distances).toEqual([60])
    const segment = (id: string, order: number, distance: number) => ({
      qualification_segment_id: id,
      segment_order: order,
      distance_m: distance,
      target_face_cm: null,
      score: 100,
      arrow_count: 36,
    })
    const [multi] = projectCompetitionProgress([
      snapshot({
        qualifications: [
          qualification({
            data_level: 'arrow_by_arrow',
            distance_m: undefined,
            segments: [segment('s2', 2, 60), segment('s1', 1, 70)],
          }),
        ],
      }),
    ])
    expect(multi.qualifications[0].distances).toEqual([70, 60])
  })
  it('does not create qualification score or official status from final-only participation', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        qualifications: [],
        ranking_entries: [
          {
            ranking_entry_id: 'r',
            participation_id: 'participation-a',
            ranking_type: 'final',
            position: 4,
            source_kind: 'supplied',
          },
        ],
      }),
    ])
    expect(card.qualifications).toEqual([])
    expect(card.finalPosition.value).toBe(4)
    expect(card.finalStatuses).toEqual([])
  })
  it('marks contradictory final positions for review', () => {
    const [card] = projectCompetitionProgress([
      snapshot({
        final_results: [
          {
            final_result_id: 'f',
            participation_id: 'participation-a',
            final_position: 4,
            result_status: 'provisional',
            source_kind: 'supplied',
          },
        ],
        ranking_entries: [
          {
            ranking_entry_id: 'r',
            participation_id: 'participation-a',
            ranking_type: 'final',
            position: 5,
            source_kind: 'supplied',
          },
        ],
      }),
    ])
    expect(card.finalPosition).toEqual({ value: null, review: true })
  })
  it('deduplicates canonical IDs while keeping legitimate same-name participations', () => {
    const base = snapshot()
    const another = snapshot({
      participations: [{ ...base.participations[0], participation_id: 'participation-b' }],
      qualifications: [
        qualification({
          qualification_id: 'q-b',
          participation_id: 'participation-b',
        }),
      ],
    })
    expect(projectCompetitionProgress([base, base, another])).toHaveLength(2)
  })
  it('replaces the projection on new snapshots and respects current-version tombstones', () => {
    expect(projectCompetitionProgress([snapshot()])[0].qualifications).toHaveLength(1)
    const updated = snapshot({
      dataset_version: 2,
      dataset_version_id: 'version-a-2',
      tombstones: [
        {
          entity_type: 'qualification',
          entity_id: 'qualification-a',
          replacement_entity_id: null,
          effective_dataset_version_id: 'version-a-2',
        },
      ],
    })
    expect(projectCompetitionProgress([updated])[0].qualifications).toEqual([])
    expect(projectCompetitionProgress([])).toEqual([])
  })
  it('sorts by sporting event date and never by read time', () => {
    const older = snapshot({ checked_at: '2026-11-01T15:00:00Z' })
    const newer = snapshot({
      dataset_id: 'dataset-b',
      tournament: {
        ...older.tournament,
        start_date: '2026-10-18',
        name: 'Evento posterior',
      },
    })
    expect(projectCompetitionProgress([older, newer]).map((row) => row.eventName)).toEqual([
      'Evento posterior',
      'Evento de prueba',
    ])
  })
  it('keeps a withdrawal effective when the current snapshot carries a tombstone from an earlier version', () => {
    const current = snapshot({
      dataset_version: 3,
      dataset_version_id: 'version-a-3',
      tombstones: [
        {
          entity_type: 'qualification',
          entity_id: 'qualification-a',
          replacement_entity_id: null,
          effective_dataset_version_id: 'version-a-2',
        },
      ],
    })
    expect(projectCompetitionProgress([current])[0].qualifications).toEqual([])
  })
})
