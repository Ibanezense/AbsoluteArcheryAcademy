export type RenewalPromptState = {
  membership_status: string | null
  membership_end?: string | null
  classes_remaining: number | null
}

export type RenewalPriceInput = {
  regular_price: number | null
  country_club_price: number | null
}

export type RenewalOptionInput = {
  name: string
  classes_included: number
  regular_price: number
  country_club_price: number | null
  effective_price: number
  is_country_club_member: boolean
}

const RENEWAL_PACKAGES = [
  { classes: 4, regularPrice: 160, countryClubPrice: 130 },
  { classes: 8, regularPrice: 240, countryClubPrice: 170 },
  { classes: 12, regularPrice: 310, countryClubPrice: null },
  { classes: 16, regularPrice: 370, countryClubPrice: null },
] as const

export const OPEN_MEMBERSHIP_RENEWAL_EVENT = 'membership-renewal:open'

export function openMembershipRenewalPrompt() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_MEMBERSHIP_RENEWAL_EVENT))
}

function isPastDate(dateValue: string | null | undefined, now: Date) {
  if (!dateValue) return false

  const [year, month, day] = dateValue.split('-').map(Number)
  if (!year || !month || !day) return false

  const endDate = new Date(year, month - 1, day)
  endDate.setHours(0, 0, 0, 0)

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  return endDate < today
}

export function shouldShowRenewalPrompt(state: RenewalPromptState | null, now = new Date()) {
  if (!state) return false

  const hasNoClasses = (state.classes_remaining ?? 0) <= 0
  const isExpired = state.membership_status === 'expired' || isPastDate(state.membership_end, now)

  return isExpired && hasNoClasses
}

export function getRenewalPrice(plan: RenewalPriceInput, isCountryClubMember: boolean) {
  if (isCountryClubMember && plan.country_club_price !== null && plan.country_club_price !== undefined) {
    return plan.country_club_price
  }

  return plan.regular_price ?? 0
}

export function normalizeRenewalOptions<T extends RenewalOptionInput>(options: T[]) {
  const isCountryClubMember = options.some((option) => option.is_country_club_member)

  return RENEWAL_PACKAGES
    .map((renewalPackage) => {
      const matchingOption = options.find((option) => (
        option.classes_included === renewalPackage.classes
        && Number(option.regular_price) === renewalPackage.regularPrice
        && (
          renewalPackage.countryClubPrice === null
            ? option.country_club_price === null
            : Number(option.country_club_price) === renewalPackage.countryClubPrice
        )
      )) || options.find((option) => option.classes_included === renewalPackage.classes)

      if (!matchingOption) return null

      return {
        ...matchingOption,
        name: `${renewalPackage.classes} clases`,
        classes_included: renewalPackage.classes,
        regular_price: renewalPackage.regularPrice,
        country_club_price: renewalPackage.countryClubPrice,
        effective_price: isCountryClubMember && renewalPackage.countryClubPrice !== null
          ? renewalPackage.countryClubPrice
          : renewalPackage.regularPrice,
        is_country_club_member: isCountryClubMember,
      } as T
    })
    .filter((option): option is T => option !== null)
}

export function formatSoles(amount: number | null | undefined) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}
