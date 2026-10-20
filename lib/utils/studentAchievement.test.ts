import { describe, expect, it } from 'vitest'
import { getCompetitionAward } from './studentAchievement'
const result = {
  finalPosition: { value: 2, review: false },
  finalStatuses: ['official'],
  participationStatus: 'finished',
}
describe('documented competition awards', () => {
  it('recognizes an official final podium with distinct medal labels', () => {
    expect(getCompetitionAward(result)).toMatchObject({
      metal: 'silver',
      label: 'Medalla de plata',
      place: 2,
    })
    expect(
      getCompetitionAward({ ...result, finalPosition: { value: 1, review: false } })?.metal
    ).toBe('gold')
    expect(
      getCompetitionAward({ ...result, finalPosition: { value: 3, review: false } })?.metal
    ).toBe('bronze')
  })
  it('does not award a medal from provisional, unknown, mixed or missing result states', () => {
    for (const states of [[], ['provisional'], ['unknown'], ['official', 'provisional']])
      expect(getCompetitionAward({ ...result, finalStatuses: states })).toBeNull()
  })
  it('does not award a medal to a disputed or absent final position, or to classification alone', () => {
    for (const value of [null, 0, 4, 2.5])
      expect(
        getCompetitionAward({ ...result, finalPosition: { value, review: false } })
      ).toBeNull()
    expect(
      getCompetitionAward({ ...result, finalPosition: { value: 2, review: true } })
    ).toBeNull()
    expect(getCompetitionAward({ ...result, finalStatuses: [] })).toBeNull()
  })
  it('does not celebrate DNS, DNF, disqualified or unfinished participations', () => {
    for (const status of ['dns', 'dnf', 'disqualified', 'entered', 'started', 'unknown'])
      expect(getCompetitionAward({ ...result, participationStatus: status })).toBeNull()
  })
})
