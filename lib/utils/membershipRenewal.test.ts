import { describe, expect, it } from 'vitest'
import { getRenewalPrice, normalizeRenewalOptions, shouldShowRenewalPrompt } from './membershipRenewal'

describe('membership renewal helpers', () => {
  it('shows prompt when membership is expired by status or by end date and no classes remain', () => {
    const now = new Date('2026-04-30T10:00:00-05:00')

    expect(shouldShowRenewalPrompt({ membership_status: 'expired', classes_remaining: 0 }, now)).toBe(true)
    expect(shouldShowRenewalPrompt({ membership_status: 'active', membership_end: '2026-04-19', classes_remaining: 0 }, now)).toBe(true)
    expect(shouldShowRenewalPrompt({ membership_status: 'expired', classes_remaining: 2 }, now)).toBe(false)
    expect(shouldShowRenewalPrompt({ membership_status: 'active', membership_end: '2026-05-19', classes_remaining: 0 }, now)).toBe(false)
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
