'use client'

import { useQuery } from '@tanstack/react-query'
import {
  competitionProgressKeys,
  fetchStudentCompetitionProgress,
} from '@/lib/services/studentCompetitionsService'
import { ProgressRequestError } from '@/lib/services/studentProgressService'

export function useStudentCompetitions(accountId: string, studentId: string) {
  return useQuery({
    queryKey: competitionProgressKeys.student(accountId, studentId),
    queryFn: ({ signal }) => fetchStudentCompetitionProgress(accountId, studentId, signal),
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
