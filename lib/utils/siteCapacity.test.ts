import { describe, expect, it } from 'vitest'
import { calculateSiteCapacity } from './siteCapacity'

describe('site capacity by session', () => {
  it('counts everyone towards the four spaces in Umacollo', () => {
    expect(calculateSiteCapacity({ site: 'umacollo', occupiedPeople: 3, academyBowsInUse: 2, usableAcademyBows: 4 })).toEqual({ ownBowSpaces: 1, academyBowSpaces: 1 })
    expect(calculateSiteCapacity({ site: 'umacollo', occupiedPeople: 4, academyBowsInUse: 2, usableAcademyBows: 4 })).toEqual({ ownBowSpaces: 0, academyBowSpaces: 0 })
  })
  it('keeps own-bow capacity unlimited in Tiabaya while sharing six academy slots', () => {
    expect(calculateSiteCapacity({ site: 'tiabaya', occupiedPeople: 18, academyBowsInUse: 4, usableAcademyBows: 6 })).toEqual({ ownBowSpaces: null, academyBowSpaces: 2 })
    expect(calculateSiteCapacity({ site: 'tiabaya', occupiedPeople: 9, academyBowsInUse: 6, usableAcademyBows: 6 })).toEqual({ ownBowSpaces: null, academyBowSpaces: 0 })
  })
  it('respects usable equipment and never reports negative capacity', () => {
    expect(calculateSiteCapacity({ site: 'tiabaya', occupiedPeople: 8, academyBowsInUse: 3, usableAcademyBows: 4 })).toEqual({ ownBowSpaces: null, academyBowSpaces: 1 })
    expect(calculateSiteCapacity({ site: 'umacollo', occupiedPeople: 7, academyBowsInUse: 5, usableAcademyBows: 4 })).toEqual({ ownBowSpaces: 0, academyBowSpaces: 0 })
  })
  it('rejects inconsistent input instead of inventing availability', () => {
    expect(() => calculateSiteCapacity({ site: 'umacollo', occupiedPeople: 1, academyBowsInUse: 2, usableAcademyBows: 4 })).toThrow()
    expect(() => calculateSiteCapacity({ site: 'tiabaya', occupiedPeople: -1, academyBowsInUse: 0, usableAcademyBows: 6 })).toThrow()
  })
})
