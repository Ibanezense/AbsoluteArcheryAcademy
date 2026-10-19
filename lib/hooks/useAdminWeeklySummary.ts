import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminWeeklySummary } from '@/lib/services/adminWeeklySummaryService'
import { getLimaWeek } from '@/lib/utils/adminWeeklySummary'

export function useAdminWeeklySummary() {
  const [now, setNow] = useState(() => new Date())
  const week = getLimaWeek(now)
  useEffect(() => {
    const updateClock = () => setNow(new Date())
    const timer = window.setTimeout(updateClock, Math.max(0, Date.parse(week.nextMonday) - Date.now()) + 50)
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateClock)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateClock)
    }
  }, [week.nextMonday])
  const query = useQuery({
    queryKey: ['admin-dashboard-operational', 'weekly-summary', week.startDate],
    queryFn: () => fetchAdminWeeklySummary(week.startDate),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  return { ...query, week }
}
