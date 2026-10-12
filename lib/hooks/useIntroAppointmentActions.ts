import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IntroClassesService, type IntroAppointmentChange } from '@/lib/services/IntroClassesService'
import { INTRO_CALENDAR_KEY } from './useIntroCalendar'
import { INTRO_AVAILABLE_SESSIONS_QUERY_KEY } from '@/lib/utils/introAvailability'
import { WEEKEND_INTRO_CAPACITY_QUERY_KEY } from '@/lib/utils/weekendIntroCapacity'

export function useIntroAppointmentActions() {
  const queryClient = useQueryClient()
  const refresh = async () => {
    await Promise.all([
      INTRO_CALENDAR_KEY, INTRO_AVAILABLE_SESSIONS_QUERY_KEY, WEEKEND_INTRO_CAPACITY_QUERY_KEY,
      ['admin-dashboard-operational'], ['sessions'], ['admin-bookings'], ['upcoming_bookings'], ['student-dashboard'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  }
  const mutation = useMutation({
    mutationFn: (input: IntroAppointmentChange) => IntroClassesService.changeAppointment(input),
    onSuccess: refresh,
    onError: refresh,
  })
  return { ...mutation, refresh }
}
