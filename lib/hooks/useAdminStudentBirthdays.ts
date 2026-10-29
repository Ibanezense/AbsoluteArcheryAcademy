'use client'

import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { getAdminStudentBirthdayFlags, prepareStudentBirthdayDay } from '@/lib/services/studentBirthdayService'
import { useBirthdayFreshness } from './useBirthdayFreshness'

export const adminStudentBirthdayKeys = {
  all: ['admin-student-birthdays'] as const,
  list: (accountId: string | null | undefined, studentIds: readonly string[]) => ['admin-student-birthdays', accountId, [...new Set(studentIds)].sort()] as const,
}

export function useAdminStudentBirthdays(accountId: string | null | undefined, studentIds: readonly string[]) {
  const ids = [...new Set(studentIds)].sort()
  const scope = JSON.stringify([accountId, ids])
  const enabled = !!accountId && ids.length > 0
  const query = useQuery({
    queryKey: adminStudentBirthdayKeys.list(accountId, ids),
    enabled,
    queryFn: async () => {
      // An absent day is not an empty result; a retry can cross midnight safely.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await prepareStudentBirthdayDay(supabase, null)
        const snapshot = await getAdminStudentBirthdayFlags(supabase, ids)
        if (snapshot.ready || attempt === 1) return snapshot
      }
      throw new Error('No se pudo preparar la consulta de cumpleaños.')
    },
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const { refetch } = query
  const refresh = useCallback(() => { if (enabled) void refetch() }, [enabled, refetch])
  const fresh = useBirthdayFreshness(scope, query.data, refresh)
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  const available = enabled && fresh && !!query.data?.ready && !query.error
  const flags: Record<string, boolean> = available
    ? Object.fromEntries(query.data!.students.filter(row => ids.includes(row.student_id)).map(row => [row.student_id, row.is_birthday_today]))
    : {}
  return {
    ...query,
    flags,
    available,
    partial: available && Object.keys(flags).length < ids.length,
    unavailable: enabled && !query.isFetching && !available,
  }
}
