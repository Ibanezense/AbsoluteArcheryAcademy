export type DailyClubEntryType = 'student' | 'intro' | 'admin'

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
