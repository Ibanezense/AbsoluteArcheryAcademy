import { beforeEach, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./studentProgressService', () => ({ progressRequest: request }))
import {
  competitionProgressKeys,
  fetchStudentCompetitionProgress,
} from './studentCompetitionsService'
beforeEach(() => request.mockReset())
it('isolates competition queries by account, student and source', () => {
  expect(competitionProgressKeys.student('a', 's')).toEqual([
    'student-progress',
    'a',
    's',
    'competitions',
  ])
  expect(competitionProgressKeys.student('a', 's')).not.toEqual(
    competitionProgressKeys.student('b', 's')
  )
  expect(competitionProgressKeys.student('a', 's')).not.toEqual(
    competitionProgressKeys.student('a', 'other')
  )
})
it('passes the current account and cancellation signal to the private request', async () => {
  request.mockResolvedValue({ state: 'pending_link', student_id: 'student-a', datasets: [] })
  const signal = new AbortController().signal
  await fetchStudentCompetitionProgress('account-a', 'student-a', signal)
  expect(request).toHaveBeenCalledWith('/api/student-progress/competitions?studentId=student-a', {
    accountId: 'account-a',
    signal,
  })
})
it.each([
  { state: 'ready', student_id: 'other', datasets: [] },
  { state: 'invented', student_id: 'student-a', datasets: [] },
  { state: 'ready', student_id: 'student-a', datasets: null },
])('rejects another student or malformed response', async (value) => {
  request.mockResolvedValue(value)
  await expect(fetchStudentCompetitionProgress('account-a', 'student-a')).rejects.toThrow('alumno')
})
