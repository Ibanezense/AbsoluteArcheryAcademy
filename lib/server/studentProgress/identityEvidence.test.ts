import { describe, expect, it } from 'vitest'
import { identityConfirmationEvidence } from './identityEvidence'
describe('identity confirmation audit', () => {
  it('records explicit confirmation without requiring typed text for either source', () => {
    for (const source of ['controls', 'competitions'] as const) {
      expect(identityConfirmationEvidence({ identityVerified: true }, source)).toContain('confirmada manualmente')
    }
  })
  it('does not let a client invent the automatic confirmation note', () => {
    expect(identityConfirmationEvidence({ identityVerified: true, evidence: 'INVENTED' }, 'controls')).not.toContain('INVENTED')
  })
  it('requires the decision and rejects false or malformed verification', () => {
    for (const body of [{}, { identityVerified: false }, { identityVerified: 'true' }, { identityVerified: false, evidence: 'old note' }]) {
      expect(() => identityConfirmationEvidence(body, 'competitions')).toThrow()
    }
  })
  it('preserves compatibility with already deployed confirmation clients', () => {
    expect(identityConfirmationEvidence({ evidence: ' Reviewed prior client ' }, 'competitions')).toBe('Reviewed prior client')
    expect(() => identityConfirmationEvidence({ evidence: '' }, 'controls')).toThrow()
  })
})
