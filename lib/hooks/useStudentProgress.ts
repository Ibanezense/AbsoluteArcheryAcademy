'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchStudentTrainingProgress,
  ProgressRequestError,
  studentProgressKeys,
} from '@/lib/services/studentProgressService'

export function useProgressAccountId() {
  const [accountId, setAccountId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let events = 0
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      events++
      if (active) setAccountId(session?.user.id || null)
    })
    void supabase.auth.getSession().then(({ data }) => {
      if (active && events === 0) setAccountId(data.session?.user.id || null)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
  return accountId
}

export function useStudentProgress(
  accountId: string | null,
  studentId: string | null,
  ready: boolean
) {
  return useQuery({
    queryKey: studentProgressKeys.training(accountId, studentId),
    queryFn: ({ signal }) => fetchStudentTrainingProgress(accountId!, studentId!, signal),
    enabled: ready && !!accountId && !!studentId,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    retry: (count, error) =>
      !(error instanceof ProgressRequestError && [401, 403, 404].includes(error.status)) &&
      count < 1,
  })
}
