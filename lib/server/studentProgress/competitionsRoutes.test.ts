import { afterEach, describe, it, expect, vi } from 'vitest'
import * as auth from './auth'
import * as links from './engineLinks'
import * as client from './engineClient'
import { GET } from '@/app/api/student-progress/competitions/route'
import { POST } from '@/app/api/admin/student-progress-competitions/route'
const id = '20000000-0000-4000-8000-000000000001'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
describe('competitions API privacy', () => {
  it('fails closed without feature flag and without actor/source calls', async () => {
    vi.stubEnv('STUDENT_PROGRESS_COMPETITIONS_ENABLED', 'false')
    const a = vi.spyOn(auth, 'authorize')
    const h = vi.spyOn(client, 'engineHistory')
    const response = await GET(
      new Request(
        `http://localhost/api/student-progress/competitions?studentId=${id}`
      )
    )
    expect(response.status).toBe(404)
    expect(a).not.toHaveBeenCalled()
    expect(h).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('never contacts TE when student is inaccessible', async () => {
    vi.stubEnv('STUDENT_PROGRESS_COMPETITIONS_ENABLED', 'true')
    vi.spyOn(auth, 'authorize').mockResolvedValue({} as never)
    vi.spyOn(links, 'readEngineContext').mockRejectedValue(
      new auth.ProgressError(403, 'forbidden')
    )
    const h = vi.spyOn(client, 'engineHistory')
    const response = await GET(
      new Request(
        `http://localhost/api/student-progress/competitions?studentId=${id}`
      )
    )
    expect(response.status).toBe(403)
    expect(h).not.toHaveBeenCalled()
  })
  it('requires administrator before directory search', async () => {
    vi.spyOn(auth, 'authorize').mockRejectedValue(
      new auth.ProgressError(403, 'forbidden')
    )
    const search = vi.spyOn(client, 'engineSearch')
    const response = await POST(
      new Request('http://localhost/api/admin/student-progress-competitions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'search',
          studentId: id,
          query: 'Name',
        }),
      })
    )
    expect(response.status).toBe(403)
    expect(search).not.toHaveBeenCalled()
  })
})
