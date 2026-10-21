// Plans marked 30 use the monthly calendar rule approved by the academy.
// Special plans keep their inclusive duration in days. Gifts supply explicit dates elsewhere.
export function membershipCycleEndDate(start: string, durationDays: number, period = 1): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(durationDays) || durationDays < 1 || !Number.isInteger(period) || period < 1 || period > 12) throw new Error('Fecha o duración no válida')
  const date = new Date(`${start}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) throw new Error('Fecha no válida')
  if (durationDays === 30) {
    const day = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + period)
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, lastDay))
  } else date.setUTCDate(date.getUTCDate() + durationDays * period - 1)
  return date.toISOString().slice(0, 10)
}
