import { describe, expect, it } from 'vitest'
import { normalizeGuardianContact, resolveGuardianContact, apiErrorMessage, guardianAccessPayload } from './studentGuardianContact'

describe('guardian contact for receipts', () => {
  it('accepts a shared student email and preserves leading zeros in the DNI', () => {
    expect(normalizeGuardianContact({ full_name: ' Tutor ', email: 'familia@example.com', phone: '123', dni: '01234567' })).toEqual({ full_name: 'Tutor', email: 'familia@example.com', phone: '123', dni: '01234567' })
  })
  it('allows contact without an email and rejects an invalid DNI or missing name', () => {
    expect(normalizeGuardianContact({ full_name: 'Tutor', dni: '01234567' })?.email).toBeNull()
    expect(() => normalizeGuardianContact({ full_name: 'Tutor', dni: '123' })).toThrow('8 dígitos')
    expect(() => normalizeGuardianContact({ full_name: '', dni: '01234567' })).toThrow('nombre del tutor')
  })
  it('reads saved billing contact before the existing access profile and preserves legacy contact', () => {
    const account = { full_name: 'Cuenta tutor', email: 'cuenta@example.com', phone: null, dni: '87654321' }
    expect(resolveGuardianContact(null, account).dni).toBe('87654321')
    const saved = normalizeGuardianContact({ full_name: 'Responsable', dni: '01234567' })!
    expect(resolveGuardianContact(saved, account)).toEqual(saved)
  })
  it('extracts structured API errors instead of displaying object Object', () => {
    expect(apiErrorMessage({ error: { message: 'El correo ya tiene otra cuenta.' } }, 'Error')).toBe('El correo ya tiene otra cuenta.')
    expect(apiErrorMessage({ error: 'DNI inválido' }, 'Error')).toBe('DNI inválido')
    expect(apiErrorMessage({ error: {} }, 'No se pudo guardar')).toBe('No se pudo guardar')
  })
  it('keeps a linked access account unchanged when a different billing contact is edited', () => {
    const account = { full_name: 'Titular de acceso', email: 'acceso@example.com', phone: null, dni: '87654321' }
    const contact = { full_name: 'Responsable boleta', email: 'alumno@example.com', phone: '999999999', dni: '01234567' }
    expect(guardianAccessPayload(contact, account, contact.email)).toEqual({ ...account, relationship: 'Tutor' })
    expect(guardianAccessPayload(contact, null, 'nuevo@example.com').email).toBe('nuevo@example.com')
  })
})
