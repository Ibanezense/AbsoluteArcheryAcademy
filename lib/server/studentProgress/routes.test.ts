import { afterEach, describe, expect, it, vi } from 'vitest'
import * as auth from './auth'
import * as source from './source'
import { GET } from '@/app/api/student-progress/training/route'
import { POST } from '@/app/api/admin/student-progress-links/route'
const sid = '11111111-1111-4111-8111-111111111111'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
describe('private progress routes', () => {
  it('fails closed while disabled without authentication or origin calls', async () => {
    vi.stubEnv('STUDENT_PROGRESS_ENABLED', 'false')
    const guard = vi.spyOn(auth, 'authorize')
    const read = vi.spyOn(source, 'readControls')
    const response = await GET(
      new Request(`http://localhost/api/student-progress/training?studentId=${sid}`)
    )
    expect(response.status).toBe(404)
    expect(guard).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('does not query directory before admin authorization', async () => {
    vi.spyOn(auth, 'authorize').mockRejectedValue(new auth.ProgressError(403, 'forbidden'))
    const read = vi.spyOn(source, 'searchControls')
    const response = await POST(
      new Request('http://localhost/api/admin/student-progress-links', {
        method: 'POST',
        body: JSON.stringify({ action: 'search', studentId: sid, query: 'Name' }),
      })
    )
    expect(response.status).toBe(403)
    expect(read).not.toHaveBeenCalled()
  })
  it('does not query source for an inaccessible student', async () => {
    vi.stubEnv('STUDENT_PROGRESS_ENABLED', 'true')
    vi.spyOn(auth, 'authorize').mockResolvedValue({} as never)
    vi.spyOn(auth, 'readContext').mockRejectedValue(new auth.ProgressError(403, 'forbidden'))
    const read = vi.spyOn(source, 'readControls')
    const response = await GET(
      new Request(`http://localhost/api/student-progress/training?studentId=${sid}`)
    )
    expect(response.status).toBe(403)
    expect(read).not.toHaveBeenCalled()
  })
})
