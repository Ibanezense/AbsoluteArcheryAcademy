export type DailyClubEntryType = 'student' | 'intro' | 'admin' | 'guest'

export type TemporaryClubGuest = { name: string; dni: string }

export function validateTemporaryClubGuest(input: TemporaryClubGuest, existing: readonly DailyClubEntryRow[]): TemporaryClubGuest {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const dni = input.dni.trim()
  if (name.length < 2 || name.length > 120) throw new Error('Escribe un nombre completo de 2 a 120 caracteres.')
  if (!/^\d{8}$/.test(dni)) throw new Error('El DNI debe tener exactamente 8 dígitos.')
  if (existing.some(row => row.dni?.trim() === dni)) throw new Error('Este DNI ya está en la lista de ingreso.')
  return { name, dni }
}

export function appendTemporaryClubGuests(rows: readonly DailyClubEntryRow[], guests: readonly TemporaryClubGuest[]): DailyClubEntryRow[] {
  const result = [...rows]
  for (const input of guests) {
    const guest = validateTemporaryClubGuest(input, result)
    result.push({ ...guest, name: `${guest.name} (Invitado)`, type: 'guest' })
  }
  return result
}

export type DailyClubEntryRow = {
  name: string
  dni: string | null
  type: DailyClubEntryType
}

export const FIXED_CLUB_ENTRY_ADMINS: DailyClubEntryRow[] = [
  { name: 'Jose Carlos Ibanez', dni: '-', type: 'admin' },
  { name: 'Kevin Ibanez', dni: '-', type: 'admin' },
  { name: 'Fabian Ibanez Tijero', dni: '-', type: 'admin' },
]

function normalizeEntryName(row: DailyClubEntryRow) {
  const name = row.name.trim() || 'Desconocido'
  return row.type === 'intro' ? `${name} (Clase de Prueba)` : name
}

function normalizeEntryDni(row: DailyClubEntryRow) {
  if (row.type === 'admin') return '-'
  return row.dni?.trim() || 'N/A'
}

export function normalizeDailyClubEntryRows(rows: DailyClubEntryRow[]) {
  const uniqueRows = new Map<string, DailyClubEntryRow>()

  rows.forEach((row) => {
    const normalized = {
      name: normalizeEntryName(row),
      dni: normalizeEntryDni(row),
      type: row.type,
    }
    uniqueRows.set(`${normalized.name}:${normalized.dni}`, normalized)
  })

  return Array.from(uniqueRows.values())
}

export function addFixedClubEntryAdmins(rows: DailyClubEntryRow[]) {
  return [
    ...FIXED_CLUB_ENTRY_ADMINS,
    ...normalizeDailyClubEntryRows(rows),
  ]
}
