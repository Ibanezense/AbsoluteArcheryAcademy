import { beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth } }))
import {
  fetchStudentTrainingProgress,
  progressRequest,
  studentProgressKeys,
} from './studentProgressService'

describe('student progress browser service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'private-session', user: { id: 'account-A' } } },
      error: null,
    })
  })
  it('isolates cache keys by account and selected student', () => {
    expect(studentProgressKeys.training('account-A', 'student-A')).not.toEqual(
      studentProgressKeys.training('account-A', 'student-B')
    )
    expect(studentProgressKeys.training('account-A', 'student-A')).not.toEqual(
      studentProgressKeys.training('account-B', 'student-A')
    )
  })
  it('does not request data after the active session changed', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchStudentTrainingProgress('account-B', 'student-A')).rejects.toThrow('sesión')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects a response belonging to a different student', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ student_id: 'student-B', state: 'ready' }))
        )
    )
    await expect(fetchStudentTrainingProgress('account-A', 'student-A')).rejects.toThrow('alumno')
  })
  it('keeps cancellation and credentials in the request, without URL tokens', async () => {
    const signal = new AbortController().signal
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ student_id: 'student-A', state: 'pending_link', controls: [] })
        )
      )
    vi.stubGlobal('fetch', fetcher)
    await fetchStudentTrainingProgress('account-A', 'student-A', signal)
    expect(fetcher.mock.calls[0][0]).toBe('/api/student-progress/training?studentId=student-A')
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      signal,
      cache: 'no-store',
      headers: { Authorization: 'Bearer private-session' },
    })
  })
  it('never renders upstream internal error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'secret-db-private-host' }), { status: 500 })
        )
    )
    await expect(progressRequest('/api/student-progress/training')).rejects.toThrow(
      'No pudimos completar'
    )
  })
})
