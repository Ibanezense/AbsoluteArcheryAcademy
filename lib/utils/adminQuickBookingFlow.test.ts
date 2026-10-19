import { describe, expect, it } from 'vitest'
import { bookingFlowReducer, initialBookingFlow } from './adminQuickBookingFlow'

describe('quick booking transitions', () => {
  it('reopening from a profile restores its fixed student and clears the old reservation selection', () => {
    const previous = { ...initialBookingFlow('2026-10-17', 'ana'), step: 2 as const, sessionId: 'old-turn', forceBooking: true }
    expect(bookingFlowReducer(previous, { type: 'reset', date: '2026-10-18', studentId: 'ana' })).toEqual({
      studentId: 'ana', date: '2026-10-18', step: 1, sessionId: '', forceBooking: false,
    })
  })
  it('requires a student and then a session before confirmation', () => {
    const initial = initialBookingFlow('2026-10-18')
    expect(bookingFlowReducer(initial, { type: 'next' }).step).toBe(0)
    const student = bookingFlowReducer(initial, { type: 'student', value: 'ana' })
    const dateStep = bookingFlowReducer(student, { type: 'next' })
    expect(dateStep.step).toBe(1)
    expect(bookingFlowReducer(dateStep, { type: 'next' }).step).toBe(1)
    const selected = bookingFlowReducer(dateStep, { type: 'session', value: 'turno' })
    expect(bookingFlowReducer(selected, { type: 'next' }).step).toBe(2)
  })

  it.each(['student', 'date'] as const)('changing %s invalidates session and force override', (type) => {
    const state = { ...initialBookingFlow('2026-10-18', 'ana'), step: 2 as const, sessionId: 'turno', forceBooking: true }
    const changed = bookingFlowReducer(state, { type, value: 'changed' })
    expect(changed.sessionId).toBe('')
    expect(changed.forceBooking).toBe(false)
    expect(changed.step).toBeLessThan(2)
  })

  it('going back preserves the compatible selection and notes stay outside transitions', () => {
    const state = { ...initialBookingFlow('2026-10-18', 'ana'), step: 2 as const, sessionId: 'turno' }
    expect(bookingFlowReducer(state, { type: 'back' })).toEqual({ ...state, step: 1 })
  })
})
