import { normalizeMembershipWhatsAppPhone } from './membershipRenewalWhatsApp'

export function buildStudentBirthdayWhatsAppUrl(phone: string | null | undefined, studentName: string): string | null {
  const normalizedPhone = normalizeMembershipWhatsAppPhone(phone)
  if (!normalizedPhone) return null
  const message = `¡Feliz cumpleaños, ${studentName}! Todo el equipo de Absolute Archery te desea un gran día. ¡Muchas flechas al centro!`
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
}
