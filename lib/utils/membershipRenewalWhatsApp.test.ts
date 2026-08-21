import { describe, expect, it } from 'vitest'
import {
  EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE,
  LAST_CLASS_WHATSAPP_MESSAGE,
  buildMembershipRenewalWhatsAppUrl,
  getMembershipRenewalWhatsAppMessage,
  normalizeMembershipWhatsAppPhone,
} from './membershipRenewalWhatsApp'

describe('membership renewal WhatsApp helpers', () => {
  it('returns the exact approved message when one class remains', () => {
    expect(LAST_CLASS_WHATSAPP_MESSAGE).toBe(
      'Hola 👋 Te contamos que actualmente te queda *1 clase disponible* de tu membresía.\n\n'
      + 'Para que puedas continuar con tus entrenamientos sin interrupciones, te recomendamos renovar antes de utilizar tu última clase. 🏹',
    )
    expect(getMembershipRenewalWhatsAppMessage('last_class')).toBe(LAST_CLASS_WHATSAPP_MESSAGE)
  })

  it('returns the exact approved message when the membership expired', () => {
    expect(EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE).toBe(
      'Hola 👋 Te informamos que tu membresía ya se encuentra *vencida* y actualmente no tienes clases disponibles.\n\n'
      + 'Para continuar con tus entrenamientos y poder reservar nuevas clases, es necesario realizar la renovación de tu membresía. 🏹',
    )
    expect(getMembershipRenewalWhatsAppMessage('expired')).toBe(EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE)
  })

  it('returns no message for a student without a renewal alert', () => {
    expect(getMembershipRenewalWhatsAppMessage('none')).toBeNull()
  })

  it.each([
    LAST_CLASS_WHATSAPP_MESSAGE,
    EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE,
  ])('uses WhatsApp formatting and preserves both emoji code points', (message) => {
    const emojiCodePoints = Array.from(message)
      .map((character) => character.codePointAt(0))
      .filter((codePoint): codePoint is number => Boolean(codePoint && codePoint > 0xffff))

    expect(message).toContain('\n\n')
    expect(message).not.toContain('**')
    expect(emojiCodePoints).toEqual([0x1f44b, 0x1f3f9])
  })

  it.each([
    ['999 999 999', '51999999999'],
    ['999-999-999', '51999999999'],
    ['(999) 999.999', '51999999999'],
    ['+51 999 999 999', '51999999999'],
    ['51 999 999 999', '51999999999'],
    ['+1 (415) 555-2671', '14155552671'],
  ])('normalizes %s for wa.me', (phone, expected) => {
    expect(normalizeMembershipWhatsAppPhone(phone)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    '   ',
    '12345678',
    '899999999',
    '14155552671',
    '+1234567',
    '+1234567890123456',
    '+0123456789',
    '999/999/999',
    '999999999 ext 1',
  ])('rejects an unusable or ambiguous phone: %s', (phone) => {
    expect(normalizeMembershipWhatsAppPhone(phone)).toBeNull()
  })

  it('builds the exact last-class WhatsApp URL from a local Peruvian phone', () => {
    expect(buildMembershipRenewalWhatsAppUrl('999999999', 'last_class')).toBe(
      `https://wa.me/51999999999?text=${encodeURIComponent(LAST_CLASS_WHATSAPP_MESSAGE)}`,
    )
  })

  it('builds the exact expired WhatsApp URL and preserves the approved formatting', () => {
    const url = buildMembershipRenewalWhatsAppUrl('+51 999 999 999', 'expired')

    expect(url).toBe(
      `https://wa.me/51999999999?text=${encodeURIComponent(EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE)}`,
    )
    expect(decodeURIComponent(url?.split('text=')[1] ?? '')).toBe(EXPIRED_MEMBERSHIP_WHATSAPP_MESSAGE)
  })

  it('does not build a URL without a valid phone or visible alert', () => {
    expect(buildMembershipRenewalWhatsAppUrl('', 'last_class')).toBeNull()
    expect(buildMembershipRenewalWhatsAppUrl('999999999', 'none')).toBeNull()
  })
})
