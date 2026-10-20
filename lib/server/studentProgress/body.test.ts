import { describe, it, expect } from 'vitest'
import { readAdminBody } from './auth'
describe('admin progress payloads', () => {
  it('accepts bounded JSON', async () => {
    await expect(
      readAdminBody(
        new Request('http://localhost', { method: 'POST', body: '{"action":"search"}' })
      )
    ).resolves.toEqual({ action: 'search' })
  })
  it('rejects streaming body above limit without Content-Length', async () => {
    await expect(
      readAdminBody(new Request('http://localhost', { method: 'POST', body: ' '.repeat(8193) }))
    ).rejects.toMatchObject({ status: 400 })
  })
  it('rejects arrays and invalid JSON', async () => {
    for (const body of ['[]', 'null', '{'])
      await expect(
        readAdminBody(new Request('http://localhost', { method: 'POST', body }))
      ).rejects.toMatchObject({ status: 400 })
  })
})
