import { describe, expect, it } from 'vitest'
import { isLikelyNetworkError } from './networkError'

describe('isLikelyNetworkError', () => {
  it.each([
    new TypeError('Failed to fetch'),
    new Error('Network request failed'),
    new Error('ERR_INTERNET_DISCONNECTED'),
    { message: 'Load failed' },
    { name: 'NetworkError', message: 'The network connection was lost' },
  ])('recognizes transient connectivity failures', (error) => {
    expect(isLikelyNetworkError(error)).toBe(true)
  })

  it.each([
    null,
    undefined,
    new Error('Invalid login credentials'),
    { message: 'JWT expired' },
    'not an error object',
  ])('does not classify authentication or unknown failures as network errors', (error) => {
    expect(isLikelyNetworkError(error)).toBe(false)
  })
})
