import {
  authorize,
  failure,
  privateHeaders,
  ProgressError,
  readAdminBody,
  rpcError,
  success,
} from '@/lib/server/studentProgress/auth'
import { uuidPattern } from '@/lib/server/studentProgress/source'
import {
  engineIdPattern,
  enginePreview,
  engineSearch,
  EngineSourceError,
} from '@/lib/server/studentProgress/engineClient'
import {
  readAdminEngineContext,
  runEngineOperation,
  type EngineOperationResult,
} from '@/lib/server/studentProgress/engineLinks'
import { clearCompetitionsCache } from '@/lib/server/studentProgress/competitions'
import { identityConfirmationEvidence } from '@/lib/server/studentProgress/identityEvidence'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new ProgressError(400, 'invalid_request')
  return value
}
function externalId(value: unknown): string {
  if (typeof value !== 'string' || !engineIdPattern.test(value))
    throw new ProgressError(400, 'invalid_request')
  return value
}
export async function GET(request: Request) {
  try {
    const actor = await authorize(request, true),
      params = new URL(request.url).searchParams
    if (
      params.getAll('studentId').length !== 1 ||
      Array.from(params.keys()).some((k) => k !== 'studentId')
    )
      throw new ProgressError(400, 'invalid_request')
    return success(
      await readAdminEngineContext(actor, uuid(params.get('studentId')))
    )
  } catch (error) {
    return failure(error)
  }
}
export async function POST(request: Request) {
  try {
    const actor = await authorize(request, true),
      body = await readAdminBody(request),
      studentId = uuid(body.studentId)
    await readAdminEngineContext(actor, studentId)
    if (body.action === 'search') {
      if (
        typeof body.query !== 'string' ||
        body.query.trim().length < 2 ||
        body.query.length > 100
      )
        throw new ProgressError(400, 'invalid_request')
      const result = await engineSearch(body.query.trim(), studentId)
      await authorize(request, true)
      return success(result)
    }
    if (body.action === 'preview') {
      const result = await enginePreview(externalId(body.externalId))
      await authorize(request, true)
      return success(result)
    }
    let operationId: string
    if (body.action === 'beginConfirm' || body.action === 'revoke') {
      const requestId = uuid(body.requestId)
      let external: string | null = null,
        expectedLink: string | null = null,
        expectedRevision: number | null = null
      let evidence = 'Revocación administrativa'
      if (body.action === 'beginConfirm') {
        external = externalId(body.externalId)
        evidence = identityConfirmationEvidence(body, 'competitions')
        if (
          !(
            body.expectedLinkId === null ||
            typeof body.expectedLinkId === 'string'
          ) ||
          !(
            body.expectedRevision === null ||
            (Number.isInteger(body.expectedRevision) &&
              Number(body.expectedRevision) > 0)
          )
        )
          throw new ProgressError(400, 'invalid_request')
        expectedLink =
          body.expectedLinkId === null ? null : uuid(body.expectedLinkId)
        expectedRevision = body.expectedRevision as number | null
      } else {
        expectedLink = uuid(body.linkId)
        if (
          !Number.isInteger(body.expectedRevision) ||
          Number(body.expectedRevision) < 1
        )
          throw new ProgressError(400, 'invalid_request')
        expectedRevision = Number(body.expectedRevision)
      }
      const { data, error } = await actor.rpc('admin_request_engine_link', {
        p_action: body.action === 'beginConfirm' ? 'confirm' : 'revoke',
        p_request_id: requestId,
        p_student_id: studentId,
        p_external_id: external,
        p_evidence: evidence,
        p_expected_link_id: expectedLink,
        p_expected_revision: expectedRevision,
      })
      if (error) throw rpcError(error.code)
      operationId = (data as EngineOperationResult).operation.id
      clearCompetitionsCache()
    } else if (body.action === 'retry') operationId = uuid(body.operationId)
    else throw new ProgressError(400, 'invalid_request')
    return success(
      await runEngineOperation(actor, studentId, operationId, async () => {
        await authorize(request, true)
      })
    )
  } catch (error) {
    if (error instanceof EngineSourceError)
      return failure(
        new ProgressError(
          error.status === 409 ? 409 : 503,
          error.status === 409 ? 'link_conflict' : 'unavailable'
        )
      )
    return failure(error)
  }
}
const unsupported = () =>
  Response.json(
    { error: 'method_not_allowed' },
    { status: 405, headers: privateHeaders }
  )
export const PUT = unsupported,
  PATCH = unsupported,
  DELETE = unsupported
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...privateHeaders, Allow: 'GET, POST, OPTIONS' },
  })
}
