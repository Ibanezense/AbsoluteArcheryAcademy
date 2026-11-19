export function normalizeBooleanValue(value: unknown, fallback = false) {
  if (value === true) return true
  if (value === false) return false
  return fallback
}

export function validateStudentLocationId(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'both') return null
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? null : 'La sede seleccionada es inválida.'
}

export function studentLocationFields(value: string | null | undefined) {
  return value === undefined ? {} : { home_location_id: value === 'both' ? null : value || null, both_locations: value === 'both' }
}
