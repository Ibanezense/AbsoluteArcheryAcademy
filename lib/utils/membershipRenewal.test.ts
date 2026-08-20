import { describe, expect, it } from 'vitest'
import {
  getLimaRenewalDismissalKey,
  getRenewalPrice,
  getRenewalPromptCopy,
  normalizeRenewalOptions,
  shouldShowRenewalPrompt,
} from './membershipRenewal'

describe('membership renewal helpers', () => {
  it('returns the approved copy for the last available class', () => {
    expect(getRenewalPromptCopy('last_class')).toEqual({
      title: 'Te queda una sola clase',
      message: 'Te queda 1 clase disponible de tu membresía. Puedes renovarla ahora para continuar tus entrenamientos sin interrupciones.',
    })
  })

  it('returns the approved copy for an expired membership', () => {
    expect(getRenewalPromptCopy('expired')).toEqual({
      title: 'Renueva tu membresía',
      message: 'No te quedan clases disponibles. Debes renovar tu membresía para continuar tus clases y realizar nuevas reservas.',
    })
  })

  it('only opens the prompt for canonical renewal alert states', () => {
    expect(shouldShowRenewalPrompt('none')).toBe(false)
    expect(shouldShowRenewalPrompt('last_class')).toBe(true)
    expect(shouldShowRenewalPrompt('expired')).toBe(true)
  })

  it('builds the same dismissal key for the same Lima day, state, and cycle', () => {
    const morning = new Date('2026-08-20T09:00:00-05:00')
    const evening = new Date('2026-08-20T23:30:00-05:00')

    const morningKey = getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-a', morning)
    const eveningKey = getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-a', evening)

    expect(morningKey).toContain('2026-08-20')
    expect(eveningKey).toBe(morningKey)
  })

  it('changes the dismissal key on a new Lima day, state, or cycle', () => {
    const today = new Date('2026-08-20T09:00:00-05:00')
    const tomorrow = new Date('2026-08-21T09:00:00-05:00')
    const baseKey = getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-a', today)

    expect(getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-a', tomorrow)).not.toBe(baseKey)
    expect(getLimaRenewalDismissalKey('student-1', 'expired', 'cycle-a', today)).not.toBe(baseKey)
    expect(getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-b', today)).not.toBe(baseKey)
  })

  it('uses country club price when available and falls back to regular price', () => {
    expect(getRenewalPrice({ regular_price: 160, country_club_price: 130 }, true)).toBe(130)
    expect(getRenewalPrice({ regular_price: 310, country_club_price: null }, true)).toBe(310)
    expect(getRenewalPrice({ regular_price: 240, country_club_price: 170 }, false)).toBe(240)
  })

  it('normalizes duplicate renewal options into the four canonical packages', () => {
    const normalized = normalizeRenewalOptions([
      { name: '4 clases', classes_included: 4, regular_price: 160, country_club_price: 130, effective_price: 130, is_country_club_member: true },
      { name: '4 clases promo', classes_included: 4, regular_price: 100, country_club_price: null, effective_price: 100, is_country_club_member: true },
      { name: '8 clases', classes_included: 8, regular_price: 240, country_club_price: 170, effective_price: 170, is_country_club_member: true },
      { name: '12 clases', classes_included: 12, regular_price: 310, country_club_price: null, effective_price: 310, is_country_club_member: true },
      { name: '16 clases', classes_included: 16, regular_price: 370, country_club_price: null, effective_price: 370, is_country_club_member: true },
    ])

    expect(normalized.map((option) => option.classes_included)).toEqual([4, 8, 12, 16])
    expect(normalized.map((option) => option.effective_price)).toEqual([130, 170, 310, 370])
  })
})
