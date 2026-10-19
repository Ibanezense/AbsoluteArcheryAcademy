export type BookingStep = 0 | 1 | 2
export type BookingFlow = {
  step: BookingStep
  studentId: string
  date: string
  sessionId: string
  forceBooking: boolean
}
type BookingAction =
  | { type: 'student' | 'date' | 'session'; value: string }
  | { type: 'force'; value: boolean }
  | { type: 'next' | 'back' }
  | { type: 'reset'; date: string; studentId?: string }

export function initialBookingFlow(date: string, studentId = ''): BookingFlow {
  return { step: studentId ? 1 : 0, studentId, date, sessionId: '', forceBooking: false }
}

export function bookingFlowReducer(state: BookingFlow, action: BookingAction): BookingFlow {
  switch (action.type) {
    case 'reset': return initialBookingFlow(action.date, action.studentId)
    case 'student': return { ...state, studentId: action.value, sessionId: '', forceBooking: false, step: 0 }
    case 'date': return { ...state, date: action.value, sessionId: '', forceBooking: false, step: Math.min(state.step, 1) as BookingStep }
    case 'session': return { ...state, sessionId: action.value, forceBooking: false }
    case 'force': return { ...state, forceBooking: action.value }
    case 'back': return { ...state, step: Math.max(0, state.step - 1) as BookingStep }
    case 'next':
      if (!state.studentId || (state.step === 1 && !state.sessionId)) return state
      return { ...state, step: Math.min(2, state.step + 1) as BookingStep }
  }
}
