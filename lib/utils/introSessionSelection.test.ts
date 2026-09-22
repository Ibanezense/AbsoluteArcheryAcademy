import { describe, expect, it } from 'vitest'
import { resolveAvailableIntroSessionId } from './introSessionSelection'

describe('resolveAvailableIntroSessionId', () => {
  const sessions = [
    { session_id: 'session-1' },
    { session_id: 'session-2' },
  ]

  it('selects the first available session when the controlled select is still empty', () => {
    expect(resolveAvailableIntroSessionId('', sessions)).toBe('session-1')
  })

  it('preserves the selected session while it remains available', () => {
    expect(resolveAvailableIntroSessionId('session-2', sessions)).toBe('session-2')
  })

  it('clears the selection when no sessions are available', () => {
    expect(resolveAvailableIntroSessionId('session-1', [])).toBe('')
  })
})
