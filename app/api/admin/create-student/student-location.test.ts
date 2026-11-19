import { describe, expect, it } from 'vitest'
import { studentLocationFields, validateStudentLocationId } from './route-helpers'

describe('student home location payload', () => {
  it('preserves the stored location when older clients omit it', () => {
    expect(studentLocationFields(undefined)).toEqual({})
  })
  it('allows clearing a location explicitly', () => {
    expect(studentLocationFields(null)).toEqual({ home_location_id: null, both_locations: false })
    expect(studentLocationFields('')).toEqual({ home_location_id: null, both_locations: false })
  })
  it('persists a valid location and rejects malformed IDs', () => {
    const id = 'a15cfaa0-0252-491a-a6f1-a66249497d35'
    expect(studentLocationFields(id)).toEqual({ home_location_id: id, both_locations: false })
    expect(validateStudentLocationId(id)).toBeNull()
    expect(validateStudentLocationId('tiabaya')).toBe('La sede seleccionada es inválida.')
    expect(validateStudentLocationId({ id })).toBe('La sede seleccionada es inválida.')
  })
  it('allows selecting both locations and resets it when selecting one', () => {
    expect(validateStudentLocationId('both')).toBeNull()
    expect(studentLocationFields('both')).toEqual({ home_location_id: null, both_locations: true })
  })
})
