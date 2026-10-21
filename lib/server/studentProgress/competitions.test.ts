import { describe, it, expect, vi } from 'vitest'
import {
  getCompetitionsProgress,
  clearCompetitionsCache,
  collectEngineCompetitions,
} from './competitions'
const student = '20000000-0000-4000-8000-000000000001'
const link = {
  id: 'link',
  student_id: student,
  source: 'tournament_engine' as const,
  external_id: 'cmp_alpha',
  status: 'confirmed' as const,
  revision: 1,
  evidence_reference: 'checked',
  confirmed_at: null,
  updated_at: '2026-10-20T00:00:00Z',
}
describe('competition privacy and completeness', () => {
  it('reads all authorized tournament identities from one confirmed athlete anchor', async () => {
    const dataset = snapshot('dataset_1', 1, 'cmp_beta')
    const result = await collectEngineCompetitions(student, 'cmp_alpha', {
      members: async () => ['cmp_alpha', 'cmp_beta'],
      history: async (_student, id) => ({ contract_version: 'te-academy-individual-progress-history-v1', complete: true, checked_at: dataset.checked_at, datasets: id === 'cmp_beta' ? [{ dataset_id: dataset.dataset_id, dataset_version_id: dataset.dataset_version_id, dataset_version: 1, published_at: dataset.checked_at, name: 'Event', start_date: '2026-10-01' }] : [], next_cursor: null }),
      dataset: async (_student, id) => { expect(id).toBe('cmp_beta'); return dataset },
    })
    expect(result.datasets).toHaveLength(1)
    expect(result.authorized_competitor_ids).toEqual(['cmp_alpha', 'cmp_beta'])
    clearCompetitionsCache()
    const visible = await getCompetitionsProgress(student, { context: async () => ({ student_id: student, links: [link] }), read: async () => result })
    expect(visible.state).toBe('ready')
    expect(visible.datasets[0].competitor.competitor_id).toBe('cmp_beta')
  })
  it('never contacts TE for a missing local link, even if an orphan bridge exists', async () => {
    const read = vi.fn()
    expect(
      (
        await getCompetitionsProgress(student, {
          context: async () => ({ student_id: student, links: [] }),
          read,
        })
      ).state
    ).toBe('pending_link')
    expect(read).not.toHaveBeenCalled()
  })
  it('checks relationship before hot cache and again after a source response', async () => {
    clearCompetitionsCache()
    let revoked = false
    const result = await getCompetitionsProgress(student, {
      context: async () => ({
        student_id: student,
        links: revoked ? [] : [link],
      }),
      read: async () => {
        revoked = true
        return { datasets: [], failures: 0, checked_at: '2026-10-20T15:00:00Z' }
      },
    })
    expect(result.state).toBe('pending_link')
    expect(result.datasets).toEqual([])
  })
  it('does not mistake one failed identity and one empty identity for an empty full history', async () => {
    clearCompetitionsCache()
    const result = await getCompetitionsProgress(student, {
      context: async () => ({
        student_id: student,
        links: [link, { ...link, id: 'second', external_id: 'cmp_beta' }],
      }),
      read: async (id) => {
        if (id === 'cmp_beta') throw Error('down')
        return { datasets: [], failures: 0, checked_at: '2026-10-20T15:00:00Z' }
      },
    })
    expect(result.state).toBe('partial')
    expect(result.failures).toBe(1)
  })
  it('detects a repeated history cursor without claiming a complete empty result', async () => {
    const page = {
      contract_version: 'te-academy-individual-progress-history-v1' as const,
      complete: true as const,
      checked_at: '2026-10-20T15:00:00Z',
      datasets: [],
      next_cursor: 'repeat',
    }
    const result = await collectEngineCompetitions(student, 'cmp_alpha', {
      history: async () => page,
      dataset: vi.fn(),
    })
    expect(result.failures).toBeGreaterThan(0)
  })
})

function snapshot(
  datasetId = 'dataset_1',
  version = 1,
  competitor = 'cmp_alpha'
): import('@/lib/contracts/studentCompetitions').AcademyCompetitionSnapshot {
  return {
    contract_version: 'te-academy-individual-progress-v1',
    complete: true,
    checked_at: '2026-10-20T15:00:00Z',
    dataset_id: datasetId,
    dataset_version_id: `${datasetId}_v${version}`,
    dataset_version: version,
    consumer_subject: {
      namespace: 'academy_reservas_student',
      external_id: student,
      link_status: 'confirmed',
    },
    competitor: { competitor_id: competitor, display_name: 'Synthetic' },
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
        participation_id: `part_${competitor}_${datasetId}`,
        tournament_id: 'event_1',
        competitor_id: competitor,
        competitive_class_id: 'class_1',
        status: 'finished',
      },
    ],
    qualifications: [],
    final_results: [],
    ranking_entries: [],
    tombstones: [],
  }
}
function historyItem(id: string) {
  return {
    dataset_id: id,
    dataset_version_id: `${id}_v1`,
    dataset_version: 1,
    published_at: '2026-10-20T15:00:00Z',
    name: 'Event',
    start_date: '2026-09-01',
  }
}
const page = (
  datasets: ReturnType<typeof historyItem>[],
  next_cursor: string | null = null
) => ({
  contract_version: 'te-academy-individual-progress-history-v1' as const,
  complete: true as const,
  checked_at: '2026-10-20T15:00:00Z',
  datasets,
  next_cursor,
})
describe('competition catalogue and identity regression gates', () => {
  it('reads 101 datasets across two pages and deduplicates repeated canonical IDs', async () => {
    const history = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 100 }, (_, i) => historyItem(`d${i}`)),
          'page_2'
        )
      )
      .mockResolvedValueOnce(page([historyItem('d0'), historyItem('d100')]))
    const dataset = vi
      .fn()
      .mockImplementation(async (_s: string, _c: string, version: string) =>
        snapshot(version.replace(/_v1$/, ''))
      )
    const result = await collectEngineCompetitions(student, 'cmp_alpha', {
      history,
      dataset,
    })
    expect(history).toHaveBeenCalledTimes(2)
    expect(history.mock.calls[0][2]).toBeNull()
    expect(history.mock.calls[1][2]).toBe('page_2')
    expect(dataset).toHaveBeenCalledTimes(101)
    expect(result.datasets).toHaveLength(101)
    expect(new Set(result.datasets.map((d) => d.dataset_id)).size).toBe(101)
    expect(result.failures).toBe(0)
  })
  it('refreshes the catalogue only once when a dataset version disappears and drops withdrawn results', async () => {
    const history = vi
      .fn()
      .mockResolvedValueOnce(page([historyItem('withdrawn')]))
      .mockResolvedValueOnce(page([]))
    const { EngineSourceError } = await import('./engineClient')
    const dataset = vi
      .fn()
      .mockRejectedValue(new EngineSourceError(404, 'invalid_source'))
    const result = await collectEngineCompetitions(student, 'cmp_alpha', {
      history,
      dataset,
    })
    expect(history).toHaveBeenCalledTimes(2)
    expect(dataset).toHaveBeenCalledTimes(1)
    expect(result.datasets).toEqual([])
    expect(result.failures).toBe(0)
  })
  it('rereads conflicting versions across two identities and excludes the dataset if disagreement persists', async () => {
    clearCompetitionsCache()
    const links = [link, { ...link, id: 'second', external_id: 'cmp_beta' }]
    const read = vi
      .fn()
      .mockImplementation(async (id: string) => ({
        datasets: [snapshot('shared', id === 'cmp_alpha' ? 1 : 2, id)],
        failures: 0,
        checked_at: '2026-10-20T15:00:00Z',
      }))
    const result = await getCompetitionsProgress(student, {
      context: async () => ({ student_id: student, links }),
      read,
    })
    expect(read).toHaveBeenCalledTimes(4)
    expect(result.state).toBe('partial')
    expect(result.datasets).toEqual([])
    expect(result.failures).toBe(1)
  })
  it('keeps only the same current version when a second complete read resolves a version race', async () => {
    clearCompetitionsCache()
    const seen = new Set<string>()
    const links = [link, { ...link, id: 'second', external_id: 'cmp_beta' }]
    const read = vi.fn().mockImplementation(async (id: string) => {
      const version = id === 'cmp_alpha' && !seen.has(id) ? 1 : 2
      seen.add(id)
      return {
        datasets: [snapshot('shared', version, id)],
        failures: 0,
        checked_at: '2026-10-20T15:00:00Z',
      }
    })
    const result = await getCompetitionsProgress(student, {
      context: async () => ({ student_id: student, links }),
      read,
    })
    expect(read).toHaveBeenCalledTimes(4)
    expect(result.state).toBe('ready')
    expect(result.datasets).toHaveLength(2)
    expect(result.datasets.every((d) => d.dataset_version === 2)).toBe(true)
  })
  it('checks a revoked relationship before returning a hot cache, without contacting TE again', async () => {
    clearCompetitionsCache()
    const read = vi
      .fn()
      .mockResolvedValue({
        datasets: [snapshot()],
        failures: 0,
        checked_at: '2026-10-20T15:00:00Z',
      })
    await getCompetitionsProgress(student, {
      context: async () => ({ student_id: student, links: [link] }),
      read,
    })
    await expect(
      getCompetitionsProgress(student, {
        context: async () => {
          throw Error('forbidden')
        },
        read,
      })
    ).rejects.toThrow('forbidden')
    expect(read).toHaveBeenCalledTimes(1)
  })
  it('rechecks relationship after a hot cache hit before delivering its sporting data', async () => {
    clearCompetitionsCache()
    const read = vi
      .fn()
      .mockResolvedValue({
        datasets: [snapshot()],
        failures: 0,
        checked_at: '2026-10-20T15:00:00Z',
      })
    await getCompetitionsProgress(student, {
      context: async () => ({ student_id: student, links: [link] }),
      read,
    })
    let checks = 0
    await expect(
      getCompetitionsProgress(student, {
        context: async () => {
          if (++checks > 1) throw Error('forbidden')
          return { student_id: student, links: [link] }
        },
        read,
      })
    ).rejects.toThrow('forbidden')
    expect(read).toHaveBeenCalledTimes(1)
  })
})
