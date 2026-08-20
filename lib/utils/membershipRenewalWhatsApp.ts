import type { MembershipRenewalAlertState } from './membershipRenewal'

export const LAST_CLASS_WHATSAPP_MESSAGE =
  'Hola 👋 Te contamos que actualmente te queda **1 clase disponible** de tu membresía.\n'
  + 'Para que puedas continuar con tus entrenamientos sin interrupciones, te recomendamos renovar antes de utilizar tu última clase. 🏹'

export const EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE =
  'Hola 👋 Te informamos que tu membresía ya se encuentra **vencida** y actualmente no tienes clases disponibles.\n'
  + 'Para continuar con tus entrenamientos y poder reservar nuevas clases, es necesario realizar la renovación de tu membresía. 🏹'

export const MEMBERSHIP_RENEWAL_WHATSAPP_MESSAGES = {
  last_class: LAST_CLASS_WHATSAPP_MESSAGE,
  expired: EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE,
} as const

export function getMembershipRenewalWhatsAppMessage(
  state: MembershipRenewalAlertState,
) {
  if (state === 'none') return null
  return MEMBERSHIP_RENEWAL_WHATSAPP_MESSAGES[state]
}

export function normalizeMembershipWhatsAppPhone(
  phone: string | null | undefined,
) {
  const trimmedPhone = phone?.trim()
  if (!trimmedPhone || !/^\+?[\d\s().-]+$/.test(trimmedPhone)) return null

  const hasExplicitInternationalPrefix = trimmedPhone.startsWith('+')
  const digits = trimmedPhone.replace(/\D/g, '')

  if (hasExplicitInternationalPrefix) {
    return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
  }

  if (/^9\d{8}$/.test(digits)) return `51${digits}`
  if (/^519\d{8}$/.test(digits)) return digits

  return null
}

export function buildMembershipRenewalWhatsAppUrl(
  phone: string | null | undefined,
  state: MembershipRenewalAlertState,
) {
  const normalizedPhone = normalizeMembershipWhatsAppPhone(phone)
  const message = getMembershipRenewalWhatsAppMessage(state)

  if (!normalizedPhone || !message) return null

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
}
