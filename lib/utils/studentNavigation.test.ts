import { describe, expect, it } from 'vitest'
import { getStudentTab } from './studentNavigation'

describe('student navigation', () => {
  it('keeps history and booking detail under Mis reservas', () => {
    expect(getStudentTab('/mis-reservas')).toBe('reservas')
    expect(getStudentTab('/reserva/id')).toBe('reservas')
    expect(getStudentTab('/reservar')).toBe('reservar')
    expect(getStudentTab('/membresias')).toBe('membresias')
    expect(getStudentTab('/')).toBe('inicio')
  })
})
