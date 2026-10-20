import {
  authorize,
  failure,
  ProgressError,
  readAdminBody,
  readContext,
  rpcError,
  success,
} from '@/lib/server/studentProgress/auth'
import { uuidPattern, readControls, searchControls } from '@/lib/server/studentProgress/source'
import { invalidateTrainingCache } from '@/lib/server/studentProgress/training'
import { summarizeTrainingControls } from '@/lib/utils/studentTrainingProgress'
export const dynamic = 'force-dynamic'
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new ProgressError(400, 'invalid_request')
  return value
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    if (
      Array.from(params.keys()).some((k) => k !== 'studentId') ||
      params.getAll('studentId').length !== 1
    )
      throw new ProgressError(400, 'invalid_request')
    const studentId = uuid(params.get('studentId'))
    const client = await authorize(request, true)
    return success(await readContext(client, studentId))
  } catch (error) {
    return failure(error)
  }
}
export async function POST(request: Request) {
  try {
    const client = await authorize(request, true)
    const body = await readAdminBody(request)
    const studentId = uuid(body.studentId)
    const context = await readContext(client, studentId)
    if (body.action === 'search') {
      if (typeof body.query !== 'string' || body.query.trim().length < 2 || body.query.length > 100)
        throw new ProgressError(400, 'invalid_request')
      const result = await searchControls(body.query.trim())
      await authorize(request, true)
      return success(result)
    }
    if (body.action === 'preview' || body.action === 'confirm') {
      const externalId = uuid(body.externalId)
      if (
        body.action === 'confirm' &&
        (typeof body.evidence !== 'string' ||
          body.evidence.trim().length < 3 ||
          body.evidence.length > 1000 ||
          !(
            body.expectedLinkId === null ||
            (typeof body.expectedLinkId === 'string' && uuidPattern.test(body.expectedLinkId))
          ) ||
          !(
            body.expectedRevision === null ||
            (Number.isInteger(body.expectedRevision) && Number(body.expectedRevision) > 0)
          ))
      )
        throw new ProgressError(400, 'invalid_request')
      const snapshot = await readControls(externalId)
      if (body.action === 'preview') {
        await authorize(request, true)
        return success({
          student: snapshot.student,
          summary: summarizeTrainingControls(snapshot.controls, context.assigned_distance_m),
          control_count: snapshot.controls.length,
        })
      }
      const { data, error } = await client.rpc('admin_confirm_progress_link', {
        p_student_id: studentId,
        p_external_id: externalId,
        p_evidence: body.evidence,
        p_expected_link_id: body.expectedLinkId,
        p_expected_revision: body.expectedRevision,
      })
      if (error) throw rpcError(error.code)
      invalidateTrainingCache()
      return success({ link: data })
    }
    if (body.action === 'revoke') {
      const linkId = uuid(body.linkId)
      if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1)
        throw new ProgressError(400, 'invalid_request')
      const { data, error } = await client.rpc('admin_revoke_progress_link', {
        p_student_id: studentId,
        p_link_id: linkId,
        p_expected_revision: body.expectedRevision,
      })
      if (error) throw rpcError(error.code)
      invalidateTrainingCache()
      return success({ link: data })
    }
    throw new ProgressError(400, 'invalid_request')
  } catch (error) {
    return failure(error)
  }
}
