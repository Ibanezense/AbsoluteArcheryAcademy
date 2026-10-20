import type { StudentProfileResponse } from '@/lib/contracts/studentProfile'
import { progressRequest } from './studentProgressService'

export const studentProfileKeys = {
  all: ['student-profile'] as const,
  student: (accountId: string | null, studentId: string | null) =>
    ['student-profile', accountId, studentId] as const,
}

export async function fetchStudentProfile(
  accountId: string,
  studentId: string,
  signal?: AbortSignal,
) {
  const result = await progressRequest<StudentProfileResponse>(
    `/api/student-profile?studentId=${encodeURIComponent(studentId)}`,
    { accountId, signal },
  )
  if (
    !result ||
    result.student_id !== studentId ||
    !result.profile ||
    result.profile.id !== studentId ||
    (result.profile.full_name !== null &&
      typeof result.profile.full_name !== 'string')
  ) {
    throw new Error('No pudimos verificar el perfil de este alumno.')
  }
  return result
}
