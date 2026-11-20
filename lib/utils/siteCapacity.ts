type SiteCapacityInput = {
  site: 'tiabaya' | 'umacollo'
  occupiedPeople: number
  academyBowsInUse: number
  usableAcademyBows: number
}

/** null indicates that the academy has not defined a fixed capacity for own bows. */
export function calculateSiteCapacity(input: SiteCapacityInput): { ownBowSpaces: number | null; academyBowSpaces: number } {
  const { site, occupiedPeople, academyBowsInUse, usableAcademyBows } = input
  if (![occupiedPeople, academyBowsInUse, usableAcademyBows].every((value) => Number.isSafeInteger(value) && value >= 0) || academyBowsInUse > occupiedPeople) {
    throw new Error('Datos de capacidad inconsistentes')
  }

  const ownBowSpaces = site === 'umacollo' ? Math.max(4 - occupiedPeople, 0) : null
  const usableLimit = site === 'tiabaya' ? Math.min(6, usableAcademyBows) : usableAcademyBows
  const freeBows = Math.max(usableLimit - academyBowsInUse, 0)
  return {
    ownBowSpaces,
    academyBowSpaces: ownBowSpaces === null ? freeBows : Math.min(ownBowSpaces, freeBows),
  }
}
