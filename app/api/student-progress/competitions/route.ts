import {
  authorize,
  failure,
  ProgressError,
  privateHeaders,
  success,
} from '@/lib/server/studentProgress/auth'
import { uuidPattern } from '@/lib/server/studentProgress/source'
import { readEngineContext } from '@/lib/server/studentProgress/engineLinks'
import {
  collectEngineCompetitions,
  getCompetitionsProgress,
} from '@/lib/server/studentProgress/competitions'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: Request) {
  try {
    if (process.env.STUDENT_PROGRESS_COMPETITIONS_ENABLED !== 'true')
      throw new ProgressError(404, 'not_found')
    const params = new URL(request.url).searchParams,
      studentId = params.get('studentId') || ''
    if (
      params.getAll('studentId').length !== 1 ||
      Array.from(params.keys()).some((k) => k !== 'studentId') ||
      !uuidPattern.test(studentId)
    )
      throw new ProgressError(400, 'invalid_request')
    const actor = await authorize(request)
    const deadline = AbortSignal.timeout(25000)
    return success(
      await getCompetitionsProgress(studentId, {
        context: () => readEngineContext(actor, studentId),
        read: (competitorId) =>
          collectEngineCompetitions(
            studentId,
            competitorId,
            undefined,
            deadline
          ),
      })
    )
  } catch (error) {
    return failure(error)
  }
}
const unsupported = () =>
  Response.json(
    { error: 'method_not_allowed' },
    { status: 405, headers: privateHeaders }
  )
export const POST = unsupported,
  PUT = unsupported,
  PATCH = unsupported,
  DELETE = unsupported
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...privateHeaders, Allow: 'GET, OPTIONS' },
  })
}
