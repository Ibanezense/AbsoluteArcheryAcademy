import { describe, expect, it } from 'vitest'
import { buildStudentBirthdayWhatsAppUrl } from './studentBirthdayWhatsApp'

describe('manual birthday WhatsApp', () => {
  it('uses only a valid supplied phone and encodes the greeting', () => {
    const url = new URL(buildStudentBirthdayWhatsAppUrl('997224472', 'Ana & José')!)
    expect(url.origin + url.pathname).toBe('https://wa.me/51997224472')
    expect(url.searchParams.get('text')).toContain('¡Feliz cumpleaños, Ana & José!')
    expect(url.searchParams.get('text')).not.toContain('renovar')
  })
  it.each([null, undefined, '', '997224472 / 987654321', '123', 'not a phone'])('does not infer another contact for %s', phone => {
    expect(buildStudentBirthdayWhatsAppUrl(phone, 'Alumno')).toBeNull()
  })
})
