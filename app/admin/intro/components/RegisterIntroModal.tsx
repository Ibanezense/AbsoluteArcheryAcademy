'use client'

import IntroAppointmentForm from './IntroAppointmentForm'
import type { IntroCalendarSession } from '@/lib/utils/introCalendar'
import type { IntroAppointmentDetails } from '@/lib/services/IntroClassesService'

export default function RegisterIntroModal({ isOpen, initialSession, initialDate, initialLocationId, onClose, onSave }: {
  isOpen: boolean
  initialSession?: IntroCalendarSession
  initialDate?: string
  initialLocationId?: string
  onClose: () => void
  onSave: (details: IntroAppointmentDetails, sessionId: string, requestId: string) => Promise<void>
}) {
  return isOpen ? <IntroAppointmentForm initialSession={initialSession} initialDate={initialDate} initialLocationId={initialLocationId} onClose={onClose} onSave={onSave} /> : null
}
