export type MembershipRenewalAlertState = 'none' | 'last_class' | 'expired'

/** @deprecated Use MembershipRenewalAlertState from the canonical renewal alert RPC. */
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

export function getRenewalPromptCopy(
  state: Exclude<MembershipRenewalAlertState, 'none'>,
): { title: string; message: string } {
  if (state === 'last_class') {
    return {
      title: 'Te queda una sola clase',
      message: 'Te queda 1 clase disponible de tu membresía. Puedes renovarla ahora para continuar tus entrenamientos sin interrupciones.',
    }
  }

  return {
    title: 'Renueva tu membresía',
    message: 'No te quedan clases disponibles. Debes renovar tu membresía para continuar tus clases y realizar nuevas reservas.',
  }
}

export function shouldShowRenewalPrompt(state: MembershipRenewalAlertState): boolean
/**
 * @deprecated Compile-only bridge for the current popup. It never opens from
 * legacy dashboard data and will be removed when Task 4 connects canonical alerts.
 */
export function shouldShowRenewalPrompt(state: RenewalPromptState | null, now?: Date): boolean
export function shouldShowRenewalPrompt(
  state: MembershipRenewalAlertState | RenewalPromptState | null,
  _now?: Date,
) {
  return typeof state === 'string' && state !== 'none'
}

export function getLimaRenewalDismissalKey(
  studentId: string,
  state: Exclude<MembershipRenewalAlertState, 'none'>,
  stateKey: string,
  now = new Date(),
) {
  const limaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
  }).format(now)

  return `membership-renewal:${studentId}:${state}:${stateKey}:${limaDate}`
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
