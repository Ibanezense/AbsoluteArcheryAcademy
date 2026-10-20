import { afterEach, describe, it, expect, vi } from 'vitest'
import { validateEngineSnapshot, validateEngineHistory, engineDataset } from './engineClient'
export const competitionFixture = () => ({
  contract_version: 'te-academy-individual-progress-v1',
  complete: true,
  checked_at: '2026-10-20T15:00:00Z',
  dataset_id: 'dataset_1',
  dataset_version_id: 'version_1',
  dataset_version: 1,
  consumer_subject: {
    namespace: 'academy_reservas_student',
    external_id: '20000000-0000-4000-8000-000000000001',
    link_status: 'confirmed',
  },
  competitor: { competitor_id: 'cmp_alpha', display_name: 'Private athlete' },
  tournament: {
    tournament_id: 'event_1',
    name: 'Event',
    start_date: '2026-09-01',
    end_date: '2026-09-01',
  },
  competitive_classes: [
    {
      competitive_class_id: 'class_1',
      label: 'Class',
      event_type: 'individual',
      division: 'recurve',
      age_class: 'open',
      gender: 'unknown',
    },
  ],
  participations: [
    {
      participation_id: 'part_1',
      tournament_id: 'event_1',
      competitor_id: 'cmp_alpha',
      competitive_class_id: 'class_1',
      status: 'finished',
    },
  ],
  qualifications: [],
  final_results: [],
  ranking_entries: [],
  tombstones: [],
})
describe('TE consumer validation', () => {
  it('accepts retained tombstones whose effective version predates the current snapshot', () => {
    const f = competitionFixture()
    const current = {
      ...f,
      dataset_version: 2,
      dataset_version_id: 'version_2',
      tombstones: [
        {
          entity_type: 'participation',
          entity_id: 'part_1',
          replacement_entity_id: null,
          effective_dataset_version_id: 'version_1',
        },
      ],
    }
    expect(
      validateEngineSnapshot(current, f.consumer_subject.external_id, 'cmp_alpha')
    ).toEqual(current)
  })
  it('accepts an individual registration without inventing a qualification', () => {
    const f = competitionFixture()
    expect(validateEngineSnapshot(f, f.consumer_subject.external_id, 'cmp_alpha')).toEqual(f)
  })
  it('rejects another identity, incomplete payload and nonindividual categories', () => {
    const f = competitionFixture()
    expect(() =>
      validateEngineSnapshot(f, '20000000-0000-4000-8000-000000000002', 'cmp_alpha')
    ).toThrow()
    expect(() =>
      validateEngineSnapshot(
        { ...f, complete: false },
        f.consumer_subject.external_id,
        'cmp_alpha'
      )
    ).toThrow()
    expect(() =>
      validateEngineSnapshot(
        {
          ...f,
          competitive_classes: [{ ...f.competitive_classes[0], event_type: 'team' }],
        },
        f.consumer_subject.external_id,
        'cmp_alpha'
      )
    ).toThrow()
  })
  it('rejects duplicate participation and qualification pointing to another participant', () => {
    const f = competitionFixture()
    expect(() =>
      validateEngineSnapshot(
        { ...f, participations: [...f.participations, ...f.participations] },
        f.consumer_subject.external_id,
        'cmp_alpha'
      )
    ).toThrow()
  })
  it('rejects partial history pages', () => {
    expect(() =>
      validateEngineHistory({
        contract_version: 'te-academy-individual-progress-history-v1',
        complete: false,
        checked_at: '2026-10-20T15:00:00Z',
        datasets: [],
        next_cursor: null,
      })
    ).toThrow()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe('TE dataset transport envelope', () => {
  function setup(dataset_version: number) {
    const fixture = competitionFixture()
    vi.stubEnv('TOURNAMENT_ENGINE_URL', 'https://engine.example')
    vi.stubEnv('TOURNAMENT_ENGINE_ACADEMY_TOKEN', 'r'.repeat(40))
    vi.stubEnv('TOURNAMENT_ENGINE_ACADEMY_IDENTITY_TOKEN', 'i'.repeat(40))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ dataset_version, payload: fixture }))
    )
    return fixture
  }
  it('accepts the real TE dataset envelope and returns only the validated payload', async () => {
    const fixture = setup(1)
    await expect(
      engineDataset(fixture.consumer_subject.external_id, 'cmp_alpha', 'version_1')
    ).resolves.toEqual(fixture)
  })
  it('rejects a transport version that contradicts the canonical payload', async () => {
    const fixture = setup(2)
    await expect(
      engineDataset(fixture.consumer_subject.external_id, 'cmp_alpha', 'version_1')
    ).rejects.toMatchObject({ code: 'invalid_source' })
  })
})
