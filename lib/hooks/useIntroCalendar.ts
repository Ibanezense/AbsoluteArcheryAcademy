import { useQuery } from '@tanstack/react-query'
import { IntroClassesService } from '@/lib/services/IntroClassesService'

export const INTRO_CALENDAR_KEY = ['intro-calendar'] as const
export function useIntroCalendar(dateFrom: string, dateTo: string, locationId: string) {
  return useQuery({
    queryKey: [...INTRO_CALENDAR_KEY, dateFrom, dateTo, locationId],
    queryFn: () => IntroClassesService.getCalendar(dateFrom, dateTo, locationId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
