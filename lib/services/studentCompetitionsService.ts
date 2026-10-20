import type { CompetitionsProgressResponse } from '@/lib/contracts/studentCompetitions'
import { progressRequest } from './studentProgressService'

export const competitionProgressKeys = {
  student: (accountId: string | null, studentId: string | null) =>
    ['student-progress', accountId, studentId, 'competitions'] as const,
}
export async function fetchStudentCompetitionProgress(
  accountId: string,
  studentId: string,
  signal?: AbortSignal
) {
  const result = await progressRequest<CompetitionsProgressResponse>(
    `/api/student-progress/competitions?studentId=${encodeURIComponent(studentId)}`,
    { accountId, signal }
  )
  if (
    result.student_id !== studentId ||
    !['pending_link', 'empty', 'ready', 'partial', 'unavailable'].includes(result.state) ||
    !Array.isArray(result.datasets)
  ) {
    throw new Error('No pudimos verificar las competencias de este alumno.')
  }
  return result
}
