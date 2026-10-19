import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

async function requestAsset(cached: Response | undefined, network: Response) {
  const handlers: Record<string, (event: any) => void> = {}
  const put = vi.fn()
  const fetch = vi.fn().mockResolvedValue(network)
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://example.test' }, addEventListener: (name: string, callback: any) => { handlers[name] = callback } },
    caches: { match: vi.fn().mockResolvedValue(cached), open: vi.fn().mockResolvedValue({ put }) },
    URL, fetch,
  })
  let response!: Promise<Response>
  handlers.fetch({ request: { method: 'GET', mode: 'cors', destination: 'script', url: 'https://example.test/_next/static/chunks/app.js' }, respondWith: (value: Promise<Response>) => { response = value } })
  const result = await response
  await Promise.resolve()
  return { result, put, fetch }
}

describe('service worker asset recovery', () => {
  it('retries a cached failed asset and caches the successful replacement', async () => {
    const network = new Response('valid script')
    const result = await requestAsset(new Response('missing', { status: 404 }), network)
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.result).toBe(network)
    expect(result.put).toHaveBeenCalledOnce()
  })
  it('does not cache a temporary network error response', async () => {
    const result = await requestAsset(undefined, new Response('unavailable', { status: 503 }))
    expect(result.result.status).toBe(503)
    expect(result.put).not.toHaveBeenCalled()
  })
  it('continues using successful cached assets offline', async () => {
    const cached = new Response('cached script')
    const result = await requestAsset(cached, new Response('unused'))
    expect(result.result).toBe(cached)
    expect(result.fetch).not.toHaveBeenCalled()
  })
})
