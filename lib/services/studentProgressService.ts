import { supabase } from '@/lib/supabaseClient'
import type { TrainingProgressResponse } from '@/lib/contracts/studentProgress'

export const studentProgressKeys = {
  all: ['student-progress'] as const,
  training: (accountId: string | null, studentId: string | null) =>
    ['student-progress', accountId, studentId, 'training'] as const,
}
export class ProgressRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}
export async function progressRequest<T>(
  path: string,
  options: { accountId?: string; signal?: AbortSignal; body?: unknown } = {}
): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || (options.accountId && data.session.user.id !== options.accountId)) {
    throw new ProgressRequestError('Tu sesión cambió o venció. Vuelve a ingresar.', 401)
  }
  const response = await fetch(path, {
    method: options.body === undefined ? 'GET' : 'POST',
    signal: options.signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'Revisa los datos antes de continuar.',
      401: 'Tu sesión venció. Vuelve a ingresar.',
      403: 'No tienes permiso para consultar o modificar esta vinculación.',
      409: 'La vinculación cambió o ese registro ya pertenece a otro alumno. Actualiza y revísalo.',
      503: 'La consulta de controles todavía no está disponible. Inténtalo más tarde.',
    }
    throw new ProgressRequestError(
      messages[response.status] || 'No pudimos completar la consulta. Inténtalo nuevamente.',
      response.status
    )
  }
  return response.json() as Promise<T>
}
export async function fetchStudentTrainingProgress(
  accountId: string,
  studentId: string,
  signal?: AbortSignal
) {
  const result = await progressRequest<TrainingProgressResponse>(
    `/api/student-progress/training?studentId=${encodeURIComponent(studentId)}`,
    { accountId, signal }
  )
  if (
    result.student_id !== studentId ||
    !['pending_link', 'empty', 'ready', 'unavailable'].includes(result.state) ||
    !Array.isArray(result.controls)
  ) {
    throw new Error('No pudimos verificar los controles de este alumno.')
  }
  return result
}
