export function normalizeBooleanValue(value: unknown, fallback = false) {
  if (value === true) return true
  if (value === false) return false
  return fallback
}
