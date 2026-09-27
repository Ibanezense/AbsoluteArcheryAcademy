export type StudentRenewalDateTone = 'green' | 'orange' | 'red' | 'neutral'

export type StudentRenewalDateState = {
  label: 'Renovación'
  value: string
  detail: string
  tone: StudentRenewalDateTone
}

const MONTHS_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const

function parseDateKey(dateKey: string | null | undefined): Date | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null

  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function getCurrentLimaDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))

  return `${values.year}-${values.month}-${values.day}`
}

export function getStudentRenewalDateState(
  membershipEnd: string | null | undefined,
  limaDateKey = getCurrentLimaDateKey(),
): StudentRenewalDateState {
  const endDate = parseDateKey(membershipEnd)
  const currentDate = parseDateKey(limaDateKey)

  if (!endDate || !currentDate) {
    return {
      label: 'Renovación',
      value: 'Sin fecha',
      detail: 'Fecha no disponible',
      tone: 'neutral',
    }
  }

  const daysRemaining = Math.round((endDate.getTime() - currentDate.getTime()) / 86_400_000)
  const value = `${endDate.getUTCDate()} ${MONTHS_SHORT_ES[endDate.getUTCMonth()]}`

  if (daysRemaining < 0) {
    return { label: 'Renovación', value, detail: 'Renovación vencida', tone: 'red' }
  }

  if (daysRemaining <= 7) {
    return {
      label: 'Renovación',
      value,
      detail: daysRemaining === 0 ? 'Renueva hoy' : `Renueva en ${daysRemaining} días`,
      tone: 'orange',
    }
  }

  return { label: 'Renovación', value, detail: 'Próxima renovación', tone: 'green' }
}
