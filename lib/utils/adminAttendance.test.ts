import { describe, expect, it } from 'vitest'
import { attendanceActions } from './adminAttendance'

describe('attendance actions by booking state', () => {
  it('offers attendance and editing only for pending bookings', () => {
    expect(attendanceActions('reserved')).toEqual({ canMark: true, canEdit: true, cancellationLabel: 'Cancelar por academia' })
  })
  it('names correction explicitly for processed bookings', () => {
    for (const status of ['attended', 'no_show'] as const) {
      expect(attendanceActions(status)).toEqual({ canMark: false, canEdit: false, cancellationLabel: 'Corregir y cancelar' })
    }
  })
  it('does not offer mutations on a cancelled booking', () => {
    expect(attendanceActions('cancelled')).toEqual({ canMark: false, canEdit: false, cancellationLabel: null })
  })
})
