'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchStudentProfile,
  studentProfileKeys,
} from '@/lib/services/studentProfileService'
import { ProgressRequestError } from '@/lib/services/studentProgressService'

export function useStudentProfile(
  accountId: string | null,
  studentId: string | null,
  ready: boolean,
) {
  return useQuery({
    queryKey: studentProfileKeys.student(accountId, studentId),
    queryFn: ({ signal }) =>
      fetchStudentProfile(accountId!, studentId!, signal),
    enabled: ready && !!accountId && !!studentId,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: (count, error) =>
      !(
        error instanceof ProgressRequestError &&
        [401, 403, 404].includes(error.status)
      ) && count < 1,
  })
}
