const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'network request failed',
  'networkerror',
  'network error',
  'load failed',
  'internet disconnected',
  'network connection was lost',
]

export function isLikelyNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { name?: unknown; message?: unknown }
  const name = typeof candidate.name === 'string' ? candidate.name : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  const description = `${name} ${message}`.toLowerCase().replace(/[_-]+/g, ' ')

  return NETWORK_ERROR_PATTERNS.some((pattern) => description.includes(pattern))
}
