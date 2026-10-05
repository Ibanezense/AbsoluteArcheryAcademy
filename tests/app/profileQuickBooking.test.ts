import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('reservations from the student profile', () => {
  it('opens the existing admin booking flow locked to this student and refreshes the profile', () => {
    const profile = readFileSync('app/admin/alumnos/[id]/page.tsx', 'utf8')
    expect(profile).toContain('Agregar reserva')
    expect(profile).toContain('studentId={data.id}')
    expect(profile).toContain('onBooked={refreshStudentData}')
  })
  it('locks the student picker when opened from a profile and calls the success callback', () => {
    const modal = readFileSync('components/AdminQuickBooking.tsx', 'utf8')
    expect(modal).toContain('studentId?: string')
    expect(modal).toContain('setSelectedStudent(studentId ||')
    expect(modal).toContain('disabled={Boolean(studentId)}')
    expect(modal).toContain('await onBooked?.()')
  })
})
