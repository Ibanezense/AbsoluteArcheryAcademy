'use client'

import IntroAppointmentForm from './IntroAppointmentForm'
import type { IntroCalendarSession } from '@/lib/utils/introCalendar'
import type { IntroAppointmentDetails } from '@/lib/services/IntroClassesService'

export default function RegisterIntroModal({ isOpen, initialSession, onClose, onSave }: {
  isOpen: boolean
  initialSession?: IntroCalendarSession
  onClose: () => void
  onSave: (details: IntroAppointmentDetails, sessionId: string, requestId: string) => Promise<void>
}) {
  return isOpen ? <IntroAppointmentForm initialSession={initialSession} onClose={onClose} onSave={onSave} /> : null
}
