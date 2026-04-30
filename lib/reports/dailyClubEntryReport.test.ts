import { describe, expect, it } from 'vitest'
import { addFixedClubEntryAdmins, normalizeDailyClubEntryRows } from './dailyClubEntryReport'

describe('daily club entry report helpers', () => {
  it('adds fixed admin entries before normalized booking rows', () => {
    const result = addFixedClubEntryAdmins([
      { name: 'Alumno Uno', dni: '12345678', type: 'student' },
    ])

    expect(result.map((row) => row.name)).toEqual([
      'Jose Carlos Ibanez',
      'Kevin Ibanez',
      'Fabian Ibanez Tijero',
      'Alumno Uno',
    ])
  })

  it('deduplicates report rows by name and DNI', () => {
    const result = normalizeDailyClubEntryRows([
      { name: ' Alumno Uno ', dni: '12345678', type: 'student' },
      { name: 'Alumno Uno', dni: '12345678', type: 'student' },
      { name: 'Prospecto', dni: null, type: 'intro' },
    ])

    expect(result).toEqual([
      { name: 'Alumno Uno', dni: '12345678', type: 'student' },
      { name: 'Prospecto (Clase de Prueba)', dni: 'N/A', type: 'intro' },
    ])
  })
})
