import {
  authorize,
  failure,
  privateHeaders,
  ProgressError,
  readContext,
  success,
} from '@/lib/server/studentProgress/auth'
import { uuidPattern, readControls } from '@/lib/server/studentProgress/source'
import { getTrainingProgress } from '@/lib/server/studentProgress/training'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    if (process.env.STUDENT_PROGRESS_ENABLED !== 'true') throw new ProgressError(404, 'not_found')
    const params = new URL(request.url).searchParams
    const studentId = params.get('studentId') || ''
    if (
      Array.from(params.keys()).some((k) => k !== 'studentId') ||
      params.getAll('studentId').length !== 1 ||
      !uuidPattern.test(studentId)
    )
      throw new ProgressError(400, 'invalid_request')
    const client = await authorize(request)
    return success(
      await getTrainingProgress(studentId, {
        context: () => readContext(client, studentId),
        read: readControls,
      })
    )
  } catch (error) {
    return failure(error)
  }
}
export async function POST() {
  return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: privateHeaders })
}
