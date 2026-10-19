import { describe, expect, it } from 'vitest'
import { followUpWindow } from './adminFollowUp'

describe('administrative follow-up periods', () => {
  it('matches the dashboard historical populations instead of opening today', () => {
    expect(followUpWindow('trial', '2026-10-18')).toMatchObject({ from: '2026-09-18', to: '2026-10-18', statuses: ['reserved', 'attended', 'no_show'] })
    expect(followUpWindow('no_show', '2026-10-18')).toMatchObject({ from: '2026-10-04', to: '2026-10-19', statuses: ['no_show'] })
  })
  it('validates unknown modes and keeps month boundaries', () => {
    expect(followUpWindow('bad', '2026-01-01').type).toBe('no_show')
    expect(followUpWindow('trial', '2026-01-01').from).toBe('2025-12-02')
  })
})
